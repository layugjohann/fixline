"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3, MapPin, MessageSquare, Table2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  URGENCY_LABELS,
  boardColumns,
  boardLocations,
  boardTrades,
  filterBoard,
  formatDateTime,
  initials,
  linkedMessages,
  senderName,
  tradeLabel,
  type BoardColumnKey,
  type BoardFilters,
} from "@/console";
import { URGENCIES, locationId, type Message, type Trade, type Urgency, type WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { cn } from "@/lib/utils";
import { locationName } from "../location-name";

const URGENCY_DOTS: Record<BoardColumnKey, string> = {
  emergency: "bg-urgency-emergency",
  urgent: "bg-urgency-urgent",
  routine: "bg-urgency-routine",
  closed: "bg-muted-foreground/40",
};

type View = "kanban" | "table";

/**
 * A workspace's Board: Kanban columns by Urgency (Closed collapsed) or a filterable table.
 * Clicking a Work Order opens a side sheet with its description and linked Messages.
 */
export function BoardView({
  board,
  messages,
  badge,
}: {
  board: readonly WorkOrder[];
  /** The Messages the workspace holds, to show the ones linked to a Work Order. */
  messages: readonly Message[];
  /** Shown beside the heading, such as "Demo · recorded". */
  badge: string;
}) {
  const [view, setView] = useState<View>("kanban");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = board.find((workOrder) => workOrder.id === selectedId);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="text-lg font-semibold">Board</h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{badge}</span>
          <span className="text-xs text-muted-foreground">
            {board.filter((workOrder) => workOrder.status === "open").length} open ·{" "}
            {board.filter((workOrder) => workOrder.status === "closed").length} closed
          </span>
        </div>
        <div role="group" aria-label="Board view" className="flex rounded-lg border bg-card p-0.5">
          {(
            [
              { key: "kanban", label: "Kanban", icon: <Columns3 /> },
              { key: "table", label: "Table", icon: <Table2 /> },
            ] as const
          ).map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={view === option.key ? "secondary" : "ghost"}
              aria-pressed={view === option.key}
              onClick={() => setView(option.key)}
              className="h-7"
            >
              {option.icon} {option.label}
            </Button>
          ))}
        </div>
      </header>

      {view === "kanban" ? (
        <KanbanView board={board} onOpen={setSelectedId} />
      ) : (
        <TableView board={board} onOpen={setSelectedId} />
      )}

      <WorkOrderSheet workOrder={selected} messages={messages} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function KanbanView({
  board,
  onOpen,
}: {
  board: readonly WorkOrder[];
  onOpen: (id: string) => void;
}) {
  const [closedOpen, setClosedOpen] = useState(false);
  const columns = boardColumns(board);

  return (
    <section aria-label="Board" className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-6">
      {columns.map((column) => {
        const collapsed = column.key === "closed" && !closedOpen;
        const headingId = `board-column-${column.key}`;
        if (collapsed) {
          return (
            <button
              key={column.key}
              type="button"
              onClick={() => setClosedOpen(true)}
              aria-expanded={false}
              aria-label={`Closed, ${column.workOrders.length} Work Orders (show)`}
              className="flex w-11 shrink-0 flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/40 py-3 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" />
              <span className="font-mono text-xs">{column.workOrders.length}</span>
              <span className="text-xs font-semibold tracking-wide uppercase [writing-mode:vertical-rl]">Closed</span>
            </button>
          );
        }
        return (
          <section
            key={column.key}
            aria-labelledby={headingId}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 ring-1 ring-border",
              column.key === "closed" && "opacity-80",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span aria-hidden className={cn("size-2 rounded-full", URGENCY_DOTS[column.key])} />
              <h2 id={headingId} className="text-xs font-semibold tracking-wide uppercase">
                {column.label}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">{column.workOrders.length}</span>
              {column.key === "closed" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto size-6"
                  aria-expanded
                  aria-label="Collapse Closed"
                  onClick={() => setClosedOpen(false)}
                >
                  <ChevronRight />
                </Button>
              )}
            </header>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {column.workOrders.length === 0 ? (
                <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No Work Orders
                </li>
              ) : (
                column.workOrders.map((workOrder) => (
                  <li key={workOrder.id}>
                    <WorkOrderCard workOrder={workOrder} onOpen={onOpen} />
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function WorkOrderCard({
  workOrder,
  onOpen,
}: {
  workOrder: WorkOrder;
  onOpen: (id: string) => void;
}) {
  const messageCount = workOrder.messageIds.length;
  return (
    <button
      type="button"
      onClick={() => onOpen(workOrder.id)}
      aria-label={`${workOrder.id}: ${workOrder.title}`}
      className="w-full rounded-lg bg-card p-3 text-left shadow-xs ring-1 ring-border outline-none hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{workOrder.id}</span>
        <TradeBadge trade={workOrder.trade} />
      </span>
      <span className="mt-1 block font-medium leading-snug">{workOrder.title}</span>
      <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{locationName(workOrder.location)}</span>
        </span>
        <span
          className="ml-auto flex shrink-0 items-center gap-1"
          title={`${messageCount} linked ${messageCount === 1 ? "Message" : "Messages"}`}
        >
          <MessageSquare className="size-3" />
          <span className="sr-only">Linked Messages:</span> {messageCount}
        </span>
      </span>
    </button>
  );
}

function TradeBadge({ trade }: { trade: Trade }) {
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
      {tradeLabel(trade)}
    </span>
  );
}

function UrgencyLabel({ urgency }: { urgency: Urgency }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={cn("size-2 rounded-full", URGENCY_DOTS[urgency])} />
      {URGENCY_LABELS[urgency]}
    </span>
  );
}

const selectClass =
  "h-8 rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TableView({
  board,
  onOpen,
}: {
  board: readonly WorkOrder[];
  onOpen: (id: string) => void;
}) {
  const [filters, setFilters] = useState<BoardFilters>({});
  const id = useId();
  const rows = filterBoard(board, filters);
  const filtered = filters.urgency !== undefined || filters.trade !== undefined || filters.location !== undefined;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
      <div role="group" aria-label="Filters" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-urgency`}>
          Urgency
          <select
            id={`${id}-urgency`}
            className={selectClass}
            value={filters.urgency ?? ""}
            onChange={(event) => setFilters({ ...filters, urgency: (event.target.value || undefined) as Urgency | undefined })}
          >
            <option value="">All</option>
            {URGENCIES.map((urgency) => (
              <option key={urgency} value={urgency}>
                {URGENCY_LABELS[urgency]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-trade`}>
          Trade
          <select
            id={`${id}-trade`}
            className={selectClass}
            value={filters.trade ?? ""}
            onChange={(event) => setFilters({ ...filters, trade: (event.target.value || undefined) as Trade | undefined })}
          >
            <option value="">All</option>
            {boardTrades(board).map((trade) => (
              <option key={trade} value={trade}>
                {tradeLabel(trade)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-location`}>
          Location
          <select
            id={`${id}-location`}
            className={selectClass}
            value={filters.location ?? ""}
            onChange={(event) => setFilters({ ...filters, location: event.target.value || undefined })}
          >
            <option value="">All</option>
            {boardLocations(board)
              .map((location) => ({ value: locationId(location), label: locationName(location) }))
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </label>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {board.length} Work Orders
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table aria-label="Board" className="w-full text-left">
          <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Work Order</th>
              <th className="px-4 py-2 font-medium">Urgency</th>
              <th className="px-4 py-2 font-medium">Trade</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 text-right font-medium">Messages</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {board.length === 0 ? "No Work Orders yet." : "No Work Orders match these filters."}
                </td>
              </tr>
            ) : (
              rows.map((workOrder) => (
                <tr
                  key={workOrder.id}
                  className={cn("border-b align-top last:border-0 hover:bg-muted/40", workOrder.status === "closed" && "opacity-60")}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(workOrder.id)}
                      className="text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{workOrder.id}</span>
                      <span className="block font-medium">{workOrder.title}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <UrgencyLabel urgency={workOrder.urgency} />
                  </td>
                  <td className="px-4 py-3">
                    <TradeBadge trade={workOrder.trade} />
                  </td>
                  <td className="px-4 py-3">{locationName(workOrder.location)}</td>
                  <td className="px-4 py-3 text-right font-mono">{workOrder.messageIds.length}</td>
                  <td className="px-4 py-3 capitalize">{workOrder.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkOrderSheet({
  workOrder,
  messages,
  onClose,
}: {
  workOrder: WorkOrder | undefined;
  messages: readonly Message[];
  onClose: () => void;
}) {
  return (
    <Sheet open={workOrder !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>{workOrder && <WorkOrderDetails workOrder={workOrder} messages={messages} />}</SheetContent>
    </Sheet>
  );
}

function WorkOrderDetails({ workOrder, messages }: { workOrder: WorkOrder; messages: readonly Message[] }) {
  const linked = linkedMessages(workOrder, messages);
  const raisedBy = propertyRoster.tenants.find((tenant) => tenant.id === workOrder.raisedByTenantId);
  return (
    <>
      <SheetHeader>
        <span className="font-mono text-xs text-muted-foreground">{workOrder.id}</span>
        <SheetTitle>{workOrder.title}</SheetTitle>
        <SheetDescription className="flex items-center gap-1">
          <MapPin className="size-3.5" /> {locationName(workOrder.location)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-5 pb-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Urgency</dt>
          <dd>
            <UrgencyLabel urgency={workOrder.urgency} />
          </dd>
          <dt className="text-muted-foreground">Trade</dt>
          <dd>
            <TradeBadge trade={workOrder.trade} />
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="capitalize">{workOrder.status}</dd>
          <dt className="text-muted-foreground">Raised by</dt>
          <dd>
            {raisedBy ? (
              raisedBy.name
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <UserX className="size-3.5" /> A Sender not in the Property Roster
              </span>
            )}
          </dd>
        </dl>

        <section aria-labelledby="work-order-description" className="space-y-2">
          <h3 id="work-order-description" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Description
          </h3>
          <p className="leading-relaxed whitespace-pre-wrap">{workOrder.description}</p>
        </section>

        <section aria-labelledby="work-order-messages" className="space-y-2">
          <h3 id="work-order-messages" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Linked Messages <span className="font-mono">{workOrder.messageIds.length}</span>
          </h3>
          {workOrder.messageIds.length === 0 && <p className="text-muted-foreground">No Messages linked.</p>}
          <ul className="space-y-2">
            {linked.messages.map((message) => (
              <li key={message.id}>
                <article aria-label={`Message from ${senderName(message)}`} className="rounded-xl rounded-tl-sm bg-card p-3 ring-1 ring-border">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground"
                    >
                      {initials(senderName(message))}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{senderName(message)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(message.receivedAt)}</span>
                  </div>
                  <p className="mt-2 leading-relaxed whitespace-pre-wrap">{message.body}</p>
                </article>
              </li>
            ))}
            {linked.missing.map((id) => (
              <li key={id} className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                <span className="font-mono">{id}</span> isn&apos;t held in this workspace.
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
