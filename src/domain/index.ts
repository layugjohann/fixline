/**
 * Shared domain types for Fixline. Names follow GLOSSARY.md exactly.
 *
 * Each type is defined by a Zod schema so untrusted input (model output,
 * request bodies, fixtures) can be parsed rather than cast.
 */
import { z } from "zod";

// --- People and places -----------------------------------------------------

export const UnitSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  label: z.string(),
});
export type Unit = z.infer<typeof UnitSchema>;

/** A shared space in a Property that belongs to no single Unit, such as a lobby or laundry room. */
export const CommonAreaSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  name: z.string(),
});
export type CommonArea = z.infer<typeof CommonAreaSchema>;

export const PropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  units: z.array(UnitSchema),
  commonAreas: z.array(CommonAreaSchema),
});
export type Property = z.infer<typeof PropertySchema>;

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  unitId: z.string(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const PropertyRosterSchema = z.object({
  properties: z.array(PropertySchema),
  tenants: z.array(TenantSchema),
});
export type PropertyRoster = z.infer<typeof PropertyRosterSchema>;

// --- Intake ----------------------------------------------------------------

/** Whoever sent a Message. Resolves to a Tenant only if the Property Roster lists them. */
export const SenderSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
});
export type Sender = z.infer<typeof SenderSchema>;

/** One raw inbound communication, exactly as received and never edited. */
export const MessageSchema = z.object({
  id: z.string(),
  sender: SenderSchema,
  receivedAt: z.string(),
  body: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

// --- Work ------------------------------------------------------------------

export const URGENCIES = ["emergency", "urgent", "routine"] as const;
export const UrgencySchema = z.enum(URGENCIES);
export type Urgency = z.infer<typeof UrgencySchema>;

export const TRADES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "carpentry",
  "locksmith",
  "pest-control",
  "general",
] as const;
export const TradeSchema = z.enum(TRADES);
export type Trade = z.infer<typeof TradeSchema>;

/** Where a Work Order's problem is: one Unit, or one Common Area. */
export const WorkOrderLocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unit"),
    unitId: z.string().describe("Id of the Unit where the problem is"),
  }),
  z.object({
    type: z.literal("common-area"),
    commonAreaId: z.string().describe("Id of the Common Area (lobby, laundry room...) where the problem is"),
  }),
]);
export type WorkOrderLocation = z.infer<typeof WorkOrderLocationSchema>;

/** Whether two locations are the same Unit or the same Common Area. */
export function sameLocation(a: WorkOrderLocation, b: WorkOrderLocation): boolean {
  return a.type === "unit"
    ? b.type === "unit" && a.unitId === b.unitId
    : b.type === "common-area" && a.commonAreaId === b.commonAreaId;
}

/** A location's id: the Unit id or the Common Area id. */
export function locationId(location: WorkOrderLocation): string {
  return location.type === "unit" ? location.unitId : location.commonAreaId;
}

/** The structured record of one maintenance problem in one Unit or Common Area. */
export const WorkOrderSchema = z.object({
  id: z.string(),
  location: WorkOrderLocationSchema,
  title: z.string(),
  description: z.string(),
  trade: TradeSchema,
  urgency: UrgencySchema,
  status: z.enum(["open", "closed"]),
  /** The Message(s) this Work Order came from. */
  messageIds: z.array(z.string()),
  /** The Tenant who raised it. Absent when it was raised by a Sender not in the Property Roster. */
  raisedByTenantId: z.string().optional(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

/** Fields needed to put a new Work Order on the Board. */
export type NewWorkOrder = Omit<WorkOrder, "id" | "status">;

/** New information from a Message, appended to an existing Work Order. */
export interface WorkOrderUpdate {
  information: string;
  /** The Message the information came from, linked to the Work Order. */
  messageId: string;
}

// --- Proposal --------------------------------------------------------------

export const CreateWorkOrderOperationSchema = z.object({
  type: z.literal("create"),
  location: WorkOrderLocationSchema.describe(
    "The Sender's Unit, or the Common Area when the problem is in a shared space such as the lobby",
  ),
  title: z.string().describe("Short summary of the problem"),
  description: z.string().describe("Clear description a Coordinator can dispatch from"),
  trade: TradeSchema,
  urgency: UrgencySchema,
});
export type CreateWorkOrderOperation = z.infer<typeof CreateWorkOrderOperationSchema>;

/** Whether a match is to a Work Order raised by the Sender's own Tenant or by a different one. */
export const MATCH_TYPES = ["same-tenant", "cross-tenant"] as const;
export const MatchTypeSchema = z.enum(MATCH_TYPES);
export type MatchType = z.infer<typeof MatchTypeSchema>;

export const AttachToWorkOrderOperationSchema = z.object({
  type: z.literal("attach"),
  workOrderId: z.string().describe("Id of the open Work Order this Message is about"),
  matchType: MatchTypeSchema.describe(
    '"same-tenant" if the Work Order was raised by the Sender\'s own Tenant, "cross-tenant" if a different Tenant (or an unknown Sender) raised it',
  ),
  information: z
    .string()
    .describe("The new information this Message adds to the Work Order, in a sentence or two"),
});
export type AttachToWorkOrderOperation = z.infer<typeof AttachToWorkOrderOperationSchema>;

export const ProposalOperationSchema = z.discriminatedUnion("type", [
  CreateWorkOrderOperationSchema,
  AttachToWorkOrderOperationSchema,
]);
export type ProposalOperation = z.infer<typeof ProposalOperationSchema>;

/**
 * Why the agent drafted a reply to the Sender:
 * - missing-unit: the Message doesn't say where the problem is, and the Property Roster can't tell;
 * - unit-mismatch: the Unit the Sender names doesn't match their Property Roster entry;
 * - emergency-confirmation: an emergency where the Tenant asks to hear back (is help coming,
 *   what should they do meanwhile).
 */
export const DRAFT_REPLY_PURPOSES = ["missing-unit", "unit-mismatch", "emergency-confirmation"] as const;
export const DraftReplyPurposeSchema = z.enum(DRAFT_REPLY_PURPOSES);
export type DraftReplyPurpose = z.infer<typeof DraftReplyPurposeSchema>;

/**
 * A response to the Sender composed on the company's behalf. It always goes to
 * the Sender of the Message, and is never sent without a Coordinator's approval.
 */
export const DraftReplySchema = z.object({
  purpose: DraftReplyPurposeSchema.describe(
    '"missing-unit" to ask where the problem is, "unit-mismatch" to ask the Sender to confirm their Unit, "emergency-confirmation" to answer a Tenant reporting an emergency who asks to hear back',
  ),
  body: z
    .string()
    .min(1)
    .describe("The reply to the Sender, in plain, polite language, signed by Harbor Lane Property Management"),
});
export type DraftReply = z.infer<typeof DraftReplySchema>;

/**
 * The complete set of changes the agent wants to make in response to one
 * Message. A Proposal changes nothing until it is applied.
 */
export const ProposalSchema = z.object({
  classification: z.enum(["maintenance", "not-maintenance"]),
  operations: z
    .array(ProposalOperationSchema)
    .describe("One operation per distinct problem in the Message; empty if it isn't a maintenance matter"),
  uncertain: z
    .boolean()
    .describe(
      "true if you are unsure about any part of this Proposal (what the problem is, where it is, whether it matches a Work Order, or its Urgency), so a Coordinator should check it",
    ),
  draftReplies: z
    .array(DraftReplySchema)
    .default([])
    .describe("Replies to the Sender, if any are needed; usually none. Each one waits for a Coordinator's approval"),
  reasoning: z.string().describe("Brief reasoning summary for the Coordinator"),
});
export type Proposal = z.infer<typeof ProposalSchema>;

// --- Review policy -----------------------------------------------------------

/**
 * The fixed rules of the review policy (ADR 0003) that can send a Proposal to
 * the Review Queue or flag it to a Coordinator.
 */
export const REVIEW_RULES = ["emergency", "uncertain", "cross-tenant-match", "unknown-sender", "draft-reply"] as const;
export const ReviewRuleSchema = z.enum(REVIEW_RULES);
export type ReviewRule = z.infer<typeof ReviewRuleSchema>;

/**
 * What the review policy decided to do with a Proposal:
 * - auto-apply: applied to the Board without a Coordinator;
 * - review: sent to the Review Queue, applied only if a Coordinator approves it;
 * - apply-and-flag: an emergency, applied immediately and flagged to a Coordinator;
 * - split: an emergency plus something that must go to review. Only the emergency
 *   creates are applied and flagged; every other operation waits in the Review Queue.
 */
export const ROUTING_OUTCOMES = ["auto-apply", "review", "apply-and-flag", "split"] as const;
export const RoutingOutcomeSchema = z.enum(ROUTING_OUTCOMES);
export type RoutingOutcome = z.infer<typeof RoutingOutcomeSchema>;

export const RoutingDecisionSchema = z.object({
  outcome: RoutingOutcomeSchema,
  /** Every rule that triggered, so a Coordinator can see why. Empty for auto-apply. */
  rules: z.array(ReviewRuleSchema),
  reason: z.string(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// --- Review Queue --------------------------------------------------------------

/**
 * - pending: waiting for a Coordinator to approve or reject it;
 * - approved / rejected: a Coordinator decided;
 * - flagged: an emergency already applied to the Board, waiting for a Coordinator to acknowledge it;
 * - acknowledged: a Coordinator has seen the flagged emergency.
 */
export const REVIEW_QUEUE_ENTRY_STATUSES = ["pending", "approved", "rejected", "flagged", "acknowledged"] as const;
export const ReviewQueueEntryStatusSchema = z.enum(REVIEW_QUEUE_ENTRY_STATUSES);
export type ReviewQueueEntryStatus = z.infer<typeof ReviewQueueEntryStatusSchema>;

/** One Proposal in the Review Queue, with the Message it answers and why it is there. */
export const ReviewQueueEntrySchema = z.object({
  id: z.string(),
  message: MessageSchema,
  /** The Proposal as it will be applied: the agent's, or a Coordinator's edit of it. */
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  status: ReviewQueueEntryStatusSchema,
  /**
   * The Work Orders the Proposal attaches to, as they were on the Board when it was queued (or
   * last reviewed). Approval compares them with the Board as it is now, so a Work Order that
   * changed or closed in the meantime is never silently overwritten.
   */
  attachTargets: z.array(WorkOrderSchema).default([]),
  /** The agent's original Proposal, kept once a Coordinator has edited it. */
  agentProposal: ProposalSchema.optional(),
  /** Why the last approval sent this Proposal back to review instead of applying it. */
  conflicts: z.array(z.string()).optional(),
  /** Why a Coordinator rejected the Proposal, if they said. */
  rejectionReason: z.string().optional(),
  /**
   * When a Coordinator approved the entry's Draft Replies, which marks them as sent. Nothing is
   * actually sent to the Tenant. Absent while they wait for approval, or if there are none.
   */
  draftRepliesSentAt: z.string().optional(),
});
export type ReviewQueueEntry = z.infer<typeof ReviewQueueEntrySchema>;

/** Fields needed to add a Proposal to the Review Queue. */
export type NewReviewQueueEntry = Omit<ReviewQueueEntry, "id">;

/** What a Coordinator's decision may change on a Review Queue entry. */
export type ReviewQueueEntryChanges = Partial<
  Pick<ReviewQueueEntry, "proposal" | "status" | "attachTargets" | "agentProposal" | "conflicts" | "rejectionReason" | "draftRepliesSentAt">
>;

// --- Trace -----------------------------------------------------------------

/**
 * One step of an Intake run. The single serialisable trace format shared by
 * live runs, eval runs and replay.
 */
export const TraceStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("model-turn"), text: z.string() }),
  z.object({
    type: z.literal("tool-call"),
    toolName: z.string(),
    input: z.unknown(),
    output: z.unknown(),
  }),
  z.object({ type: z.literal("proposal"), proposal: ProposalSchema }),
  z.object({ type: z.literal("routing"), decision: RoutingDecisionSchema }),
  /** Proposal validation rejected the Proposal: it never reached the Board or the Review Queue. */
  z.object({ type: z.literal("rejection"), problems: z.array(z.string()) }),
  /** The model provider rejected the model's tool call (an unknown tool, a schema mismatch, or no tool call). */
  z.object({ type: z.literal("rejected-tool-call"), explanation: z.string() }),
  /** The turn was tried again after a rejected tool call: retry `attempt` of at most `maxRetries`. */
  z.object({ type: z.literal("retry"), attempt: z.number().int().positive(), maxRetries: z.number().int().positive() }),
]);
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const TraceSchema = z.object({
  messageId: z.string(),
  steps: z.array(TraceStepSchema),
});
export type Trace = z.infer<typeof TraceSchema>;
