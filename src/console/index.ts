/**
 * The data behind the console's views, kept free of React so it can be tested.
 *
 * The Demo workspace is built from the recorded replays: each replay becomes one
 * Review Queue entry (read-only) and one run on the Runs page.
 */
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
} from "@/domain";
import type { Replay } from "@/replays";

// --- Review Queue -------------------------------------------------------------

/**
 * Where an entry stands, as a Coordinator working the queue sees it:
 * - pending: held for review, waiting to be approved, edited or rejected;
 * - flagged: an emergency already applied to the Board, waiting to be acknowledged;
 * - auto-applied: applied to the Board without a Coordinator;
 * - no-action: not a maintenance matter, so nothing changed;
 * - not-applied: the run ended without a routed Proposal (rejected by validation, or stopped).
 */
export type QueueStatus = "pending" | "flagged" | "auto-applied" | "no-action" | "not-applied";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "Needs review",
  flagged: "Emergency flagged",
  "auto-applied": "Auto-applied",
  "no-action": "Not maintenance",
  "not-applied": "Not applied",
};

/** The two tabs of the queue pane. */
export type QueueTab = "to-review" | "auto-handled";

export function queueTab(status: QueueStatus): QueueTab {
  return status === "pending" || status === "flagged" ? "to-review" : "auto-handled";
}

/** One entry in the Demo workspace's Review Queue, built from a recorded replay. */
export interface DemoEntry {
  /** The replay's id. */
  id: string;
  title: string;
  description?: string;
  model: string;
  recordedAt?: string;
  message: Message;
  /** The Board as it was before the run. */
  board: WorkOrder[];
  trace: Trace;
  /** The last Proposal the agent submitted, if it got that far. */
  proposal?: Proposal;
  /** What the review policy did with the Proposal, if it was routed. */
  routing?: RoutingDecision;
  /** Why validation rejected the last Proposal, if it did. */
  rejectionProblems?: string[];
  status: QueueStatus;
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
export function pendingCount(entries: readonly DemoEntry[]): number {
  return entries.filter((entry) => queueTab(entry.status) === "to-review").length;
}

/** The headline Urgency of a Proposal: the most urgent of its new Work Orders and the ones it attaches to. */
export function headlineUrgency(proposal: Proposal | undefined, board: readonly WorkOrder[]): Urgency | undefined {
  if (!proposal) return undefined;
  const urgencies = proposal.operations.map((operation) =>
    operation.type === "create" ? operation.urgency : board.find((workOrder) => workOrder.id === operation.workOrderId)?.urgency,
  );
  return (["emergency", "urgent", "routine"] as const).find((urgency) => urgencies.includes(urgency));
}

// --- Labels -------------------------------------------------------------------

export const RULE_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Agent unsure",
  "cross-tenant-match": "Matches another Tenant's Work Order",
  "unknown-sender": "Sender not in the Property Roster",
  "draft-reply": "Includes a Draft Reply",
};

export const RULE_SHORT_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Unsure",
  "cross-tenant-match": "Cross-tenant",
  "unknown-sender": "Unknown Sender",
  "draft-reply": "Draft Reply",
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
