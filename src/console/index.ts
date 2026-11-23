/**
 * The data behind the console's views, kept free of React so it can be tested.
 *
 * The Demo workspace is built from the recorded replays: each replay becomes one
 * Review Queue entry (read-only) and one run on the Runs page.
 */
import { locationId } from "@/domain";
import type {
  DraftReplyPurpose,
  Message,
  Proposal,
  ReviewRule,
  RoutingDecision,
  Trace,
  TraceStep,
  Trade,
  Urgency,
  WorkOrder,
  WorkOrderLocation,
} from "@/domain";
import type { Replay } from "@/replays";
import type { Sandbox } from "@/sandbox";

// --- Review Queue -------------------------------------------------------------

/**
 * Where an entry stands, as a Coordinator working the queue sees it:
 * - pending: held for review, waiting to be approved, edited or rejected;
 * - flagged: an emergency already applied to the Board, waiting to be acknowledged;
 * - auto-applied: applied to the Board without a Coordinator;
 * - no-action: not a maintenance matter, so nothing changed;
 * - not-applied: the run ended without a routed Proposal (rejected by validation, or stopped);
 * - approved / rejected / acknowledged: a Coordinator decided (the sandbox only).
 */
export type QueueStatus =
  | "pending"
  | "flagged"
  | "auto-applied"
  | "no-action"
  | "not-applied"
  | "approved"
  | "rejected"
  | "acknowledged";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "Needs review",
  flagged: "Emergency flagged",
  "auto-applied": "Auto-applied",
  "no-action": "Not maintenance",
  "not-applied": "Not applied",
  approved: "Approved",
  rejected: "Rejected",
  acknowledged: "Acknowledged",
};

/** The two tabs of the queue pane. */
export type QueueTab = "to-review" | "auto-handled";

export function queueTab(status: QueueStatus): QueueTab {
  return status === "pending" || status === "flagged" ? "to-review" : "auto-handled";
}

/** One entry in a workspace's Review Queue, as the queue and conversation panes show it. */
export interface QueueEntry {
  id: string;
  title: string;
  message: Message;
  /** The Board the Proposal is shown as a diff against. */
  board: WorkOrder[];
  /** The last Proposal the agent submitted (or a Coordinator's edit of it), if it got that far. */
  proposal?: Proposal;
  /** What the review policy did with the Proposal, if it was routed. */
  routing?: RoutingDecision;
  /** Why validation rejected the last Proposal, if it did. */
  rejectionProblems?: string[];
  status: QueueStatus;
}

/** One entry in the Demo workspace's Review Queue, built from a recorded replay. */
export interface DemoEntry extends QueueEntry {
  /** The replay's id. */
  id: string;
  description?: string;
  model: string;
  recordedAt?: string;
  /** The Board as it was before the run. */
  board: WorkOrder[];
  trace: Trace;
}

export function demoEntryFromReplay(replay: Replay): DemoEntry {
  const steps = replay.trace.steps;
  const proposal = steps.findLast((step) => step.type === "proposal")?.proposal;
  const routing = steps.findLast((step) => step.type === "routing")?.decision;
  const rejection = steps.findLast((step) => step.type === "rejection");
  return {
    id: replay.id,
    title: replay.title,
    description: replay.description,
    model: replay.model,
    recordedAt: replay.recordedAt,
    message: replay.message,
    board: replay.board,
    trace: replay.trace,
    proposal,
    routing,
    rejectionProblems: routing ? undefined : rejection?.problems,
    status: queueStatus(proposal, routing),
  };
}

function queueStatus(proposal: Proposal | undefined, routing: RoutingDecision | undefined): QueueStatus {
  if (!proposal || !routing) return "not-applied";
  switch (routing.outcome) {
    case "review":
    case "split":
      return "pending";
    case "apply-and-flag":
      return "flagged";
    case "auto-apply":
      return proposal.classification === "not-maintenance" ? "no-action" : "auto-applied";
  }
}

/** Every replay as a Review Queue entry, newest Message first. */
export function demoReviewQueue(replays: readonly Replay[]): DemoEntry[] {
  return replays
    .map(demoEntryFromReplay)
    .sort((a, b) => b.message.receivedAt.localeCompare(a.message.receivedAt) || a.id.localeCompare(b.id));
}

/** How many entries wait for a Coordinator: the Review Queue's badge. */
export function pendingCount(entries: readonly { status: QueueStatus }[]): number {
  return entries.filter((entry) => queueTab(entry.status) === "to-review").length;
}

// --- Sandbox Review Queue -------------------------------------------------------

/**
 * One entry in the sandbox workspace's Review Queue: a Proposal in the visitor's Review
 * Queue, or an Intake run that was applied without one (shown under Auto-handled).
 */
export interface SandboxEntry extends QueueEntry {
  /** The Review Queue entry a Coordinator decides on. Absent for runs applied without review. */
  reviewEntryId?: string;
  /** The Intake run's trace, if the run happened in this sandbox (seeded entries have none). */
  trace?: Trace;
  /** The agent's original Proposal, kept once a Coordinator has edited it. */
  agentProposal?: Proposal;
  /** Why the last approval sent the Proposal back to review. */
  conflicts?: string[];
  rejectionReason?: string;
  /** When the Draft Replies were marked as sent (nothing is actually sent from the sandbox). */
  draftRepliesSentAt?: string;
}

/**
 * The sandbox's Review Queue as the console shows it: every Review Queue entry, plus the
 * Intake runs that were applied without review, newest Message first. Proposals are shown
 * as a diff against the sandbox's Board as it is now.
 */
export function sandboxQueueEntries(sandbox: Sandbox): SandboxEntry[] {
  const queuedMessages = new Set(sandbox.reviewQueue.map((entry) => entry.message.id));
  const queued = sandbox.reviewQueue.map((entry): SandboxEntry => {
    const run = sandbox.history.findLast((candidate) => candidate.message.id === entry.message.id);
    return {
      id: entry.id,
      reviewEntryId: entry.id,
      title: proposalTitle(entry.proposal, entry.message),
      message: entry.message,
      board: [...sandbox.board, ...entry.attachTargets],
      proposal: entry.proposal,
      routing: entry.routing,
      status: entry.status,
      trace: run?.trace,
      agentProposal: entry.agentProposal,
      conflicts: entry.conflicts,
      rejectionReason: entry.rejectionReason,
      draftRepliesSentAt: entry.draftRepliesSentAt,
    };
  });
  const applied = sandbox.history.flatMap((run, index): SandboxEntry[] =>
    queuedMessages.has(run.message.id)
      ? []
      : [
          {
            id: `run-${index + 1}`,
            title: proposalTitle(run.proposal, run.message),
            message: run.message,
            board: sandbox.board,
            proposal: run.proposal,
            routing: run.routing,
            status: queueStatus(run.proposal, run.routing),
            trace: run.trace,
          },
        ],
  );
  return [...queued, ...applied].sort(
    (a, b) => b.message.receivedAt.localeCompare(a.message.receivedAt) || a.id.localeCompare(b.id),
  );
}

/** A one-line title for a Proposal: its first new Work Order, or what it attaches to. */
export function proposalTitle(proposal: Proposal, message: Message): string {
  if (proposal.classification === "not-maintenance") return "Not a maintenance matter";
  const [first] = proposal.operations;
  if (first?.type === "create") return first.title;
  if (first?.type === "attach") return `Update to ${first.workOrderId}`;
  const body = message.body.replace(/\s+/g, " ").trim();
  return body.length > 60 ? `${body.slice(0, 59)}…` : body;
}

/** The headline Urgency of a Proposal: the most urgent of its new Work Orders and the ones it attaches to. */
export function headlineUrgency(proposal: Proposal | undefined, board: readonly WorkOrder[]): Urgency | undefined {
  if (!proposal) return undefined;
  const urgencies = proposal.operations.map((operation) =>
    operation.type === "create" ? operation.urgency : board.find((workOrder) => workOrder.id === operation.workOrderId)?.urgency,
  );
  return (["emergency", "urgent", "routine"] as const).find((urgency) => urgencies.includes(urgency));
}

// --- Board ---------------------------------------------------------------------

/** A column of the Board's Kanban view: one per Urgency for open Work Orders, then Closed. */
export type BoardColumnKey = Urgency | "closed";

export interface BoardColumn {
  key: BoardColumnKey;
  label: string;
  workOrders: WorkOrder[];
}

const URGENCY_ORDER: readonly Urgency[] = ["emergency", "urgent", "routine"];

/** The Board as Kanban columns: open Work Orders by Urgency, closed ones together in a last column. */
export function boardColumns(board: readonly WorkOrder[]): BoardColumn[] {
  const open = board.filter((workOrder) => workOrder.status === "open");
  return [
    ...URGENCY_ORDER.map((urgency) => ({
      key: urgency,
      label: URGENCY_LABELS[urgency],
      workOrders: open.filter((workOrder) => workOrder.urgency === urgency),
    })),
    { key: "closed", label: "Closed", workOrders: board.filter((workOrder) => workOrder.status === "closed") },
  ];
}

/** The Board table's filters. An absent filter matches every Work Order. */
export interface BoardFilters {
  urgency?: Urgency;
  trade?: Trade;
  /** A Unit id or Common Area id. */
  location?: string;
}

/** The Work Orders that match every filter, open ones first and most urgent first. */
export function filterBoard(board: readonly WorkOrder[], filters: BoardFilters): WorkOrder[] {
  return board
    .filter(
      (workOrder) =>
        (!filters.urgency || workOrder.urgency === filters.urgency) &&
        (!filters.trade || workOrder.trade === filters.trade) &&
        (!filters.location || locationId(workOrder.location) === filters.location),
    )
    .sort(
      (a, b) =>
        Number(a.status === "closed") - Number(b.status === "closed") ||
        URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency),
    );
}

/** The distinct Trades on the Board, in the order they first appear. */
export function boardTrades(board: readonly WorkOrder[]): Trade[] {
  return [...new Set(board.map((workOrder) => workOrder.trade))];
}

/** The distinct Locations on the Board, one per Unit or Common Area. */
export function boardLocations(board: readonly WorkOrder[]): WorkOrderLocation[] {
  const seen = new Map<string, WorkOrderLocation>();
  for (const workOrder of board) {
    const id = locationId(workOrder.location);
    if (!seen.has(id)) seen.set(id, workOrder.location);
  }
  return [...seen.values()];
}

/**
 * The Messages linked to a Work Order, oldest first. A linked Message the workspace
 * doesn't hold is left out; `missing` lists the ids of those.
 */
export function linkedMessages(
  workOrder: WorkOrder,
  messages: readonly Message[],
): { messages: Message[]; missing: string[] } {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const found = workOrder.messageIds.flatMap((id) => byId.get(id) ?? []);
  return {
    messages: found.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    missing: workOrder.messageIds.filter((id) => !byId.has(id)),
  };
}

/** Every Message a sandbox holds: its seeded Board's, Incoming Messages, the Review Queue's and its runs'. */
export function sandboxMessages(sandbox: Sandbox, seeded: readonly Message[] = []): Message[] {
  const byId = new Map<string, Message>();
  for (const message of [
    ...seeded,
    ...sandbox.incomingMessages.map((item) => item.message),
    ...sandbox.reviewQueue.map((entry) => entry.message),
    ...sandbox.history.map((run) => run.message),
  ]) {
    byId.set(message.id, message);
  }
  return [...byId.values()];
}

// --- Labels -------------------------------------------------------------------

export const RULE_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Agent unsure",
  "cross-tenant-match": "Matches another Tenant's Work Order",
  "unknown-sender": "Sender not in the Property Roster",
  "draft-reply": "Includes a Draft Reply",
  "possible-duplicate": "Same Location and Trade as an open Work Order",
};

export const RULE_SHORT_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Unsure",
  "cross-tenant-match": "Cross-tenant",
  "unknown-sender": "Unknown Sender",
  "draft-reply": "Draft Reply",
  "possible-duplicate": "Possible duplicate",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  routine: "Routine",
};

export const DRAFT_REPLY_LABELS: Record<DraftReplyPurpose, string> = {
  "missing-unit": "Asks where the problem is",
  "unit-mismatch": "Asks the Sender to confirm their Unit",
  "emergency-confirmation": "Confirms help is on the way",
};

export function tradeLabel(trade: Trade): string {
  if (trade === "hvac") return "HVAC";
  const spaced = trade.replace("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A readable name for an agent tool: `searchWorkOrders` becomes "Search Work Orders". */
export function toolLabel(toolName: string): string {
  const words = toolName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  return sentence.replace(/\bwork orders?\b/gi, (match) => (match.endsWith("s") ? "Work Orders" : "Work Order")).replace(/\bsender\b/g, "Sender");
}

// --- Trace steps ----------------------------------------------------------------

export type StepKind = "model-turn" | "tool-call" | "proposal" | "routing" | "rejection" | "retry";

/** A one-line description of a trace step, for the agent-run step list. */
export interface StepSummary {
  kind: StepKind;
  label: string;
  detail: string;
}

export function describeStep(step: TraceStep): StepSummary {
  switch (step.type) {
    case "model-turn":
      return { kind: "model-turn", label: "Model turn", detail: step.text };
    case "tool-call":
      return { kind: "tool-call", label: toolLabel(step.toolName), detail: compactJson(step.input) };
    case "proposal":
      return { kind: "proposal", label: "Proposal submitted", detail: proposalSummary(step.proposal) };
    case "routing":
      return { kind: "routing", label: `Routing decision: ${step.decision.outcome}`, detail: step.decision.reason };
    case "rejection":
      return { kind: "rejection", label: "Rejected by validation", detail: step.problems.join("; ") };
    case "rejected-tool-call":
      return { kind: "rejection", label: "Tool call rejected", detail: step.explanation };
    case "retry":
      return {
        kind: "retry",
        label: `Retry ${step.attempt} of ${step.maxRetries}`,
        detail: "Told what was rejected and why.",
      };
    default: {
      // Every step type must be described: adding one to the trace format breaks this until it is.
      const unhandled: never = step;
      return unhandled;
    }
  }
}

function proposalSummary(proposal: Proposal): string {
  if (proposal.classification === "not-maintenance") return "Not a maintenance matter: no changes";
  const parts = [plural(proposal.operations.length, "change")];
  if (proposal.draftReplies.length > 0) parts.push(plural(proposal.draftReplies.length, "Draft Reply", "Draft Replies"));
  return parts.join(" · ");
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** JSON on one line, cut to fit a step list row. */
export function compactJson(value: unknown, maxLength = 90): string {
  if (value === undefined) return "";
  const text = JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** JSON for a code block; "(none)" when there is nothing. */
export function prettyJson(value: unknown): string {
  return value === undefined ? "(none)" : JSON.stringify(value, null, 2);
}

// --- Formatting -----------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 15, 09:12", in UTC so the server and the browser render the same text. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hours}:${minutes}`;
}

/** "Nov 15", in UTC. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function senderName(message: Message): string {
  return message.sender.name ?? message.sender.email;
}

export function initials(name: string): string {
  return name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
