/**
 * The Trello adapter: a Board backed by a real Trello board, through Trello's REST API.
 * This is the only module that knows about Trello.
 *
 * How a Work Order maps onto a Trello card, so the board stays readable to a Coordinator:
 *
 *   card name     the Work Order's title
 *   labels        "Urgency: emergency" (red), "Urgency: urgent" (orange), "Urgency: routine" (green),
 *                 "Trade: plumbing" (blue), and "Unit: harbor-view-2a" (purple) or
 *                 "Common Area: harbor-view-lobby" (sky)
 *   description   the Work Order's description, then each update as "Update from Message …",
 *                 then a footer: "Raised by: tenant-maya" (the Tenant who raised it, left out for an
 *                 unknown Sender) and "Messages: msg-1, msg-2" linking the Message(s) it came from
 *   list          new Work Orders go on the "Work Orders" list (created if missing)
 *   status        closed when the card is archived or sits on the "Done" list, otherwise open
 *
 * Cards without exactly one Urgency, Trade and Unit or Common Area label aren't Work Orders,
 * so the adapter ignores them. Credentials come from the environment and are sent in a header,
 * never in a URL.
 */
import { z } from "zod";
import {
  TradeSchema,
  UrgencySchema,
  type NewWorkOrder,
  type Urgency,
  type WorkOrder,
  type WorkOrderLocation,
  type WorkOrderUpdate,
} from "@/domain";
import { appendInformation, WorkOrderNotFoundError, type Board } from "./index";

const TRELLO_API = "https://api.trello.com/1";

/** Trello refused a request. */
export class TrelloApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    detail: string,
  ) {
    const hint =
      status === 401 ? " Check TRELLO_API_KEY and TRELLO_TOKEN (run scripts/setup.sh trello to set them up)." : "";
    super(`Trello ${method} ${path} failed with ${status}: ${detail.slice(0, 200)}.${hint}`);
    this.name = "TrelloApiError";
  }
}

export class TrelloNotConfiguredError extends Error {
  constructor(missing: readonly string[]) {
    super(`Trello is not configured. Set ${missing.join(", ")} (run scripts/setup.sh trello).`);
    this.name = "TrelloNotConfiguredError";
  }
}

export interface TrelloCredentials {
  apiKey: string;
  token: string;
}

type Fetch = typeof fetch;

/** A thin client for Trello's REST API. */
export class TrelloClient {
  private readonly fetch: Fetch;

  constructor(
    private readonly credentials: TrelloCredentials,
    options: { fetch?: Fetch } = {},
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: { query?: Record<string, string>; body?: Record<string, unknown> } = {},
  ): Promise<unknown> {
    const url = new URL(`${TRELLO_API}${path}`);
    for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `OAuth oauth_consumer_key="${this.credentials.apiKey}", oauth_token="${this.credentials.token}"`,
    };
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await this.fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new TrelloApiError(response.status, method, path, text || response.statusText);
    return text ? JSON.parse(text) : undefined;
  }
}

// --- Trello's shapes, parsed rather than trusted ----------------------------

const LabelSchema = z.object({ id: z.string(), name: z.string().nullish(), color: z.string().nullish() });
const ListSchema = z.object({ id: z.string(), name: z.string() });
const CardSchema = z.object({
  id: z.string(),
  idBoard: z.string(),
  idList: z.string(),
  name: z.string(),
  desc: z.string(),
  closed: z.boolean(),
  labels: z.array(LabelSchema),
});
type Card = z.infer<typeof CardSchema>;

const CARD_FIELDS = "id,idBoard,idList,name,desc,closed,labels";
const CARD_ID = /^[0-9a-f]{24}$/i;

// --- Labels ------------------------------------------------------------------

const URGENCY_PREFIX = "Urgency: ";
const TRADE_PREFIX = "Trade: ";
const UNIT_PREFIX = "Unit: ";
const COMMON_AREA_PREFIX = "Common Area: ";

const URGENCY_COLORS: Record<Urgency, string> = { emergency: "red", urgent: "orange", routine: "green" };

interface LabelSpec {
  name: string;
  color: string;
}

function labelsFor(workOrder: NewWorkOrder): LabelSpec[] {
  const location: LabelSpec =
    workOrder.location.type === "unit"
      ? { name: `${UNIT_PREFIX}${workOrder.location.unitId}`, color: "purple" }
      : { name: `${COMMON_AREA_PREFIX}${workOrder.location.commonAreaId}`, color: "sky" };
  return [
    { name: `${URGENCY_PREFIX}${workOrder.urgency}`, color: URGENCY_COLORS[workOrder.urgency] },
    { name: `${TRADE_PREFIX}${workOrder.trade}`, color: "blue" },
    location,
  ];
}

/** The one label value with this prefix, or undefined if there are none or several. */
function onlyLabel(labelNames: readonly string[], prefix: string): string | undefined {
  const values = labelNames.filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length).trim());
  return values.length === 1 ? values[0] : undefined;
}

// --- Description -------------------------------------------------------------

const FOOTER = /(?:^|\n\n)---\n(?:Raised by: ([^\n]*)\n)?Messages: ([^\n]*)\s*$/;

interface CardDescription {
  description: string;
  messageIds: readonly string[];
  raisedByTenantId?: string;
}

function cardDescription({ description, messageIds, raisedByTenantId }: CardDescription): string {
  const raisedBy = raisedByTenantId ? `Raised by: ${raisedByTenantId}\n` : "";
  const footer = `---\n${raisedBy}Messages: ${messageIds.join(", ")}`;
  return description ? `${description}\n\n${footer}` : footer;
}

function parseCardDescription(desc: string): { description: string; messageIds: string[]; raisedByTenantId?: string } {
  const footer = FOOTER.exec(desc);
  if (!footer) return { description: desc.trim(), messageIds: [] };
  const raisedByTenantId = footer[1]?.trim();
  const messageIds = (footer[2] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    description: desc.slice(0, footer.index).trim(),
    messageIds,
    ...(raisedByTenantId ? { raisedByTenantId } : {}),
  };
}

// --- The adapter ---------------------------------------------------------------

export interface TrelloBoardOptions {
  /** The board's id or the short code in its URL (trello.com/b/<code>/...). */
  boardId: string;
  /** The list new Work Orders go on. Created if the board doesn't have it. */
  workOrdersListName?: string;
  /** Work Orders on this list count as closed. */
  doneListName?: string;
}

/** A Board backed by a Trello board. */
export class TrelloBoard implements Board {
  private readonly workOrdersListName: string;
  private readonly doneListName: string;
  private boardIdPromise?: Promise<string>;
  private labelsPromise?: Promise<Map<string, string>>;
  private readonly labelIds = new Map<string, Promise<string>>();

  constructor(
    private readonly client: TrelloClient,
    private readonly options: TrelloBoardOptions,
  ) {
    this.workOrdersListName = options.workOrdersListName ?? "Work Orders";
    this.doneListName = options.doneListName ?? "Done";
  }

  async listWorkOrders(): Promise<WorkOrder[]> {
    const boardId = await this.boardId();
    const [cards, doneListIds] = await Promise.all([
      this.client.request("GET", `/boards/${boardId}/cards`, { query: { fields: CARD_FIELDS } }),
      this.doneListIds(),
    ]);
    return z
      .array(CardSchema)
      .parse(cards)
      .flatMap((card) => this.toWorkOrder(card, doneListIds) ?? []);
  }

  async getWorkOrder(id: string): Promise<WorkOrder | undefined> {
    const card = await this.card(id);
    return card && this.toWorkOrder(card, await this.doneListIds());
  }

  async createWorkOrder(workOrder: NewWorkOrder): Promise<WorkOrder> {
    const [idList, idLabels] = await Promise.all([
      this.workOrdersListId(),
      Promise.all(labelsFor(workOrder).map((label) => this.labelId(label))),
    ]);
    const created = CardSchema.pick({ id: true }).parse(
      await this.client.request("POST", "/cards", {
        body: {
          idList,
          name: workOrder.title,
          desc: cardDescription(workOrder),
          idLabels: idLabels.join(","),
          pos: "top",
        },
      }),
    );
    return this.read(created.id);
  }

  async appendToWorkOrder(id: string, update: WorkOrderUpdate): Promise<WorkOrder> {
    const card = await this.card(id);
    const workOrder = card && this.toWorkOrder(card, new Set());
    if (!workOrder) throw new WorkOrderNotFoundError(id);
    const messageIds = workOrder.messageIds.includes(update.messageId)
      ? workOrder.messageIds
      : [...workOrder.messageIds, update.messageId];
    await this.client.request("PUT", `/cards/${id}`, {
      body: {
        desc: cardDescription({
          ...workOrder,
          description: appendInformation(workOrder.description, update),
          messageIds,
        }),
      },
    });
    return this.read(id);
  }

  /** Read back a Work Order this adapter just wrote, so callers see exactly what the board holds. */
  private async read(id: string): Promise<WorkOrder> {
    const workOrder = await this.getWorkOrder(id);
    if (!workOrder) throw new WorkOrderNotFoundError(id);
    return workOrder;
  }

  /** The card with this id on this board, or undefined. */
  private async card(id: string): Promise<Card | undefined> {
    if (!CARD_ID.test(id)) return undefined;
    let raw: unknown;
    try {
      raw = await this.client.request("GET", `/cards/${id}`, { query: { fields: CARD_FIELDS } });
    } catch (error) {
      if (error instanceof TrelloApiError && (error.status === 400 || error.status === 404)) return undefined;
      throw error;
    }
    const card = CardSchema.parse(raw);
    return card.idBoard === (await this.boardId()) ? card : undefined;
  }

  private toWorkOrder(card: Card, doneListIds: ReadonlySet<string>): WorkOrder | undefined {
    const labelNames = card.labels.flatMap((label) => label.name ?? []);
    const urgency = UrgencySchema.safeParse(onlyLabel(labelNames, URGENCY_PREFIX));
    const trade = TradeSchema.safeParse(onlyLabel(labelNames, TRADE_PREFIX));
    const location = parseLocation(labelNames);
    if (!urgency.success || !trade.success || !location) return undefined;
    const { description, messageIds, raisedByTenantId } = parseCardDescription(card.desc);
    return {
      id: card.id,
      location,
      title: card.name,
      description,
      trade: trade.data,
      urgency: urgency.data,
      status: card.closed || doneListIds.has(card.idList) ? "closed" : "open",
      messageIds,
      ...(raisedByTenantId ? { raisedByTenantId } : {}),
    };
  }

  /** The board's full id: the configured id may be the short code from its URL. */
  private boardId(): Promise<string> {
    if (!this.boardIdPromise) {
      const promise = this.client
        .request("GET", `/boards/${encodeURIComponent(this.options.boardId)}`, { query: { fields: "id" } })
        .then((board) => z.object({ id: z.string() }).parse(board).id);
      // Don't remember a failure, so a later call can try again.
      promise.catch(() => (this.boardIdPromise = undefined));
      this.boardIdPromise = promise;
    }
    return this.boardIdPromise;
  }

  private async lists(): Promise<z.infer<typeof ListSchema>[]> {
    const boardId = await this.boardId();
    return z
      .array(ListSchema)
      .parse(await this.client.request("GET", `/boards/${boardId}/lists`, { query: { fields: "id,name" } }));
  }

  private async doneListIds(): Promise<Set<string>> {
    const done = this.doneListName.toLowerCase();
    return new Set((await this.lists()).filter((list) => list.name.trim().toLowerCase() === done).map((l) => l.id));
  }

  private async workOrdersListId(): Promise<string> {
    const wanted = this.workOrdersListName.toLowerCase();
    const existing = (await this.lists()).find((list) => list.name.trim().toLowerCase() === wanted);
    if (existing) return existing.id;
    const created = await this.client.request("POST", "/lists", {
      body: { name: this.workOrdersListName, idBoard: await this.boardId(), pos: "top" },
    });
    return ListSchema.parse(created).id;
  }

  /** The id of the board's label with this name, creating it the first time it's needed. */
  private labelId(label: LabelSpec): Promise<string> {
    let id = this.labelIds.get(label.name);
    if (!id) {
      id = this.findOrCreateLabel(label);
      id.catch(() => this.labelIds.delete(label.name));
      this.labelIds.set(label.name, id);
    }
    return id;
  }

  private async findOrCreateLabel(label: LabelSpec): Promise<string> {
    this.labelsPromise ??= this.boardId().then(async (boardId) => {
      const labels = z
        .array(LabelSchema)
        .parse(await this.client.request("GET", `/boards/${boardId}/labels`, { query: { limit: "1000" } }));
      return new Map(labels.flatMap((existing) => (existing.name ? [[existing.name, existing.id] as const] : [])));
    });
    const existing = (await this.labelsPromise).get(label.name);
    if (existing) return existing;
    const created = await this.client.request("POST", "/labels", {
      body: { name: label.name, color: label.color, idBoard: await this.boardId() },
    });
    return LabelSchema.parse(created).id;
  }
}

function parseLocation(labelNames: readonly string[]): WorkOrderLocation | undefined {
  const unitId = onlyLabel(labelNames, UNIT_PREFIX);
  const commonAreaId = onlyLabel(labelNames, COMMON_AREA_PREFIX);
  const hasUnit = labelNames.some((name) => name.startsWith(UNIT_PREFIX));
  const hasCommonArea = labelNames.some((name) => name.startsWith(COMMON_AREA_PREFIX));
  if (unitId && !hasCommonArea) return { type: "unit", unitId };
  if (commonAreaId && !hasUnit) return { type: "common-area", commonAreaId };
  return undefined;
}

/** Environment variables the Trello adapter reads. */
export type TrelloEnv = Readonly<Record<string, string | undefined>>;

/**
 * The Trello client and board options from the environment: TRELLO_API_KEY, TRELLO_TOKEN and
 * the board id in `boardIdEnv` (TRELLO_BOARD_ID for the real board, TRELLO_TEST_BOARD_ID for
 * the contract tests' board).
 */
export function trelloFromEnv(
  env: TrelloEnv = process.env,
  boardIdEnv = "TRELLO_BOARD_ID",
): { client: TrelloClient; options: TrelloBoardOptions } {
  const apiKey = env.TRELLO_API_KEY;
  const token = env.TRELLO_TOKEN;
  const boardId = env[boardIdEnv];
  const missing = [
    ...(apiKey ? [] : ["TRELLO_API_KEY"]),
    ...(token ? [] : ["TRELLO_TOKEN"]),
    ...(boardId ? [] : [boardIdEnv]),
  ];
  if (!apiKey || !token || !boardId) throw new TrelloNotConfiguredError(missing);
  return { client: new TrelloClient({ apiKey, token }), options: { boardId } };
}

/** The Trello Board configured in the environment. */
export function trelloBoardFromEnv(env: TrelloEnv = process.env, boardIdEnv = "TRELLO_BOARD_ID"): TrelloBoard {
  const { client, options } = trelloFromEnv(env, boardIdEnv);
  return new TrelloBoard(client, options);
}
