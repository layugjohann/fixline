"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Bot, User, UserX } from "lucide-react";
import {
  DRAFT_REPLY_LABELS,
  QUEUE_STATUS_LABELS,
  RULE_LABELS,
  RULE_SHORT_LABELS,
  URGENCY_LABELS,
  formatDate,
  formatDateTime,
  headlineUrgency,
  initials,
  queueTab,
  senderName,
  tradeLabel,
  type QueueEntry,
  type QueueStatus,
  type QueueTab,
} from "@/console";
import type { ProposalOperation, Urgency, WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { cn } from "@/lib/utils";
import { locationName } from "../location-name";

/**
 * The panes the Review Queue shares between workspaces: the queue pane (tabs and entries)
 * and the conversation pane (Message, routing divider, Proposal as a diff, Draft Replies).
 * Each workspace adds its own decision bar.
 */

const STATUS_DOTS: Record<QueueStatus, string> = {
  flagged: "bg-urgency-emergency",
  pending: "bg-urgency-urgent",
  "auto-applied": "bg-primary",
  "no-action": "bg-muted-foreground/40",
  "not-applied": "bg-destructive",
  approved: "bg-primary",
  rejected: "bg-muted-foreground/40",
  acknowledged: "bg-primary",
};

const URGENCY_BARS: Record<Urgency, string> = {
  emergency: "bg-urgency-emergency",
  urgent: "bg-urgency-urgent",
  routine: "bg-urgency-routine",
};

export function QueuePane({
  badge,
  tabLabels,
  entries,
  tab,
  onTabChange,
  selectedId,
  onSelect,
}: {
  /** Shown beside the heading, such as "Demo · recorded". */
  badge: string;
  tabLabels: Record<QueueTab, string>;
  entries: readonly QueueEntry[];
  tab: QueueTab;
  onTabChange: (tab: QueueTab) => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const visible = entries.filter((entry) => queueTab(entry.status) === tab);
  const tabs: QueueTab[] = ["to-review", "auto-handled"];

  function onTabKey(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "to-review" ? "auto-handled" : "to-review";
    onTabChange(next);
    document.getElementById(`queue-tab-${next}`)?.focus();
  }

  return (
    <section aria-labelledby="review-queue-heading" className="flex w-80 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 id="review-queue-heading" className="text-base font-semibold">
            Review Queue
          </h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{badge}</span>
        </div>
        <div role="tablist" aria-label="Queue" onKeyDown={onTabKey} className="mt-3 grid grid-cols-2 rounded-lg bg-muted p-0.5 text-xs">
          {tabs.map((key) => {
            const count = entries.filter((entry) => queueTab(entry.status) === key).length;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`queue-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="queue-list"
                tabIndex={tab === key ? 0 : -1}
                onClick={() => onTabChange(key)}
                className={cn(
                  "rounded-md py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tabLabels[key]} <span className="font-mono opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <ul id="queue-list" role="tabpanel" aria-labelledby={`queue-tab-${tab}`} className="flex-1 overflow-y-auto">
        {visible.length === 0 && <li className="p-4 text-muted-foreground">Nothing here.</li>}
        {visible.map((entry) => (
          <li key={entry.id}>
            <QueueItem entry={entry} selected={entry.id === selectedId} onSelect={() => onSelect(entry.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QueueItem({ entry, selected, onSelect }: { entry: QueueEntry; selected: boolean; onSelect: () => void }) {
  const urgency = headlineUrgency(entry.proposal, entry.board);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative w-full border-b px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected ? "bg-accent/60" : "hover:bg-muted/60",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <span className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOTS[entry.status])} title={QUEUE_STATUS_LABELS[entry.status]} />
        <span className="truncate font-medium">{senderName(entry.message)}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDate(entry.message.receivedAt)}</span>
      </span>
      <span className="mt-0.5 block truncate text-[13px]">{entry.title}</span>
      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.message.body}</span>
      <span className="mt-2 flex flex-wrap gap-1">
        {urgency && (
          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            <span className={cn("h-2 w-0.5 rounded", URGENCY_BARS[urgency])} />
            {URGENCY_LABELS[urgency]}
          </span>
        )}
        {entry.routing?.rules.map((rule) => (
          <span key={rule} className="rounded bg-warning px-1.5 py-px text-[10px] font-medium text-warning-foreground">
            {RULE_SHORT_LABELS[rule]}
          </span>
        ))}
        {queueTab(entry.status) === "auto-handled" && (
          <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            {QUEUE_STATUS_LABELS[entry.status]}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The conversation pane: the Message as an inbound bubble, why it was held, the Proposal as a
 * diff against the Board, and the Draft Replies as outgoing bubbles, with the workspace's
 * decision bar at the bottom.
 */
export function Conversation({
  entry,
  notes,
  draftReplyStatus = "not sent until approved",
  footer,
}: {
  entry: QueueEntry;
  /** Notes shown under the routing divider, such as a Coordinator's edit or a conflict. */
  notes?: ReactNode;
  draftReplyStatus?: string;
  footer: ReactNode;
}) {
  const name = senderName(entry.message);
  const tenant = propertyRoster.tenants.find((candidate) => candidate.email === entry.message.sender.email);
  const proposal = entry.proposal;

  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{name}</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {tenant ? (
              <>
                <User className="size-3" /> Tenant · {locationName({ type: "unit", unitId: tenant.unitId })}
              </>
            ) : (
              <>
                <UserX className="size-3 text-warning-foreground" /> {entry.message.sender.email} · not in the Property Roster
              </>
            )}
          </div>
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <div className="truncate">{entry.title}</div>
          <div>{QUEUE_STATUS_LABELS[entry.status]}</div>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
        <article aria-label="Message" className="max-w-2xl rounded-2xl rounded-tl-sm bg-card px-4 py-3 shadow-sm ring-1 ring-border">
          <p className="leading-relaxed whitespace-pre-wrap">{entry.message.body}</p>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {entry.message.sender.email} · {formatDateTime(entry.message.receivedAt)}
          </div>
        </article>

        <RoutingDivider entry={entry} />
        {notes}

        {proposal ? (
          <section aria-label="Proposal" className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <Bot className="size-4 text-primary" />
              <h3 className="font-semibold">Fixline proposes</h3>
              <span className="text-xs text-muted-foreground">changes to the Board</span>
              {proposal.uncertain && (
                <span className="ml-auto rounded bg-warning px-1.5 py-px text-[10px] font-medium text-warning-foreground">Agent unsure</span>
              )}
            </div>
            <p className="border-b px-4 py-3 text-[13px] text-muted-foreground italic">“{proposal.reasoning}”</p>
            <div className="space-y-3 p-4 font-mono text-[12.5px]">
              {proposal.operations.length === 0 && (
                <p className="rounded-lg bg-muted px-3 py-2 font-sans text-muted-foreground">
                  No changes to the Board{proposal.classification === "not-maintenance" ? ": not a maintenance matter." : "."}
                </p>
              )}
              {proposal.operations.map((operation, index) => (
                <OperationDiff key={index} operation={operation} board={entry.board} />
              ))}
            </div>
          </section>
        ) : (
          <section aria-label="Proposal" className="rounded-xl border border-destructive/30 bg-card p-4">
            <h3 className="font-semibold text-destructive">No Proposal reached the Review Queue</h3>
            {entry.rejectionProblems ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {entry.rejectionProblems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">The run stopped before the agent submitted a valid Proposal.</p>
            )}
          </section>
        )}

        {proposal?.draftReplies.map((reply, index) => (
          <article key={index} aria-label="Draft Reply" className="ml-auto max-w-xl">
            <div className="mb-1 text-right text-[11px] text-muted-foreground">
              Draft Reply · {DRAFT_REPLY_LABELS[reply.purpose]} · {draftReplyStatus}
            </div>
            <div className="rounded-2xl rounded-tr-sm border-2 border-dashed border-primary/40 bg-accent px-4 py-3 whitespace-pre-wrap text-accent-foreground">
              {reply.body}
            </div>
          </article>
        ))}
      </div>

      {footer}
    </section>
  );
}

function RoutingDivider({ entry }: { entry: QueueEntry }) {
  const rules = entry.routing?.rules ?? [];
  if (rules.length === 0) return null;
  const prefix = entry.status === "flagged" || entry.status === "acknowledged" ? "Applied and flagged" : "Held for review";
  return (
    <div className="flex items-center gap-2 text-xs" role="note">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-warning px-3 py-1 font-medium text-warning-foreground ring-1 ring-warning-border">
        {prefix}: {rules.map((rule) => RULE_LABELS[rule]).join(" · ")}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** One Proposal operation as a diff against the Board: a new Work Order, or a note on an existing one. */
function OperationDiff({ operation, board }: { operation: ProposalOperation; board: readonly WorkOrder[] }) {
  if (operation.type === "create") {
    return (
      <div className="overflow-hidden rounded-lg ring-1 ring-success-border">
        <div className="bg-success px-3 py-1.5 text-[11px] font-semibold tracking-wide text-success-foreground uppercase">+ New Work Order</div>
        <div className="space-y-0.5 px-3 py-2 text-success-foreground">
          <div>+ title: {operation.title}</div>
          <div>+ location: {locationName(operation.location)}</div>
          <div>+ trade: {tradeLabel(operation.trade)}</div>
          <div>+ urgency: {URGENCY_LABELS[operation.urgency]}</div>
          <p className="pt-1 font-sans text-xs text-foreground/80">{operation.description}</p>
        </div>
      </div>
    );
  }

  const target = board.find((workOrder) => workOrder.id === operation.workOrderId);
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-border">
      <div className="flex items-center gap-2 bg-muted px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
        ~ {operation.workOrderId}
        <span className="font-normal tracking-normal text-muted-foreground normal-case">
          {operation.matchType === "cross-tenant" ? "raised by another Tenant" : "same Tenant"}
        </span>
      </div>
      {target && (
        <div className="space-y-0.5 px-3 py-2 whitespace-pre text-muted-foreground">
          <div>{"  "}title: {target.title}</div>
          <div>{"  "}location: {locationName(target.location)}</div>
          <div>{"  "}urgency: {URGENCY_LABELS[target.urgency]}</div>
        </div>
      )}
      <div className="bg-success px-3 py-2 text-success-foreground">+ note: {operation.information}</div>
    </div>
  );
}

export function Kbd({ children }: { children: string }) {
  return <kbd className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-white/15">{children}</kbd>;
}
