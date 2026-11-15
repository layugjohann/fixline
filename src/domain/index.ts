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

export const AttachToWorkOrderOperationSchema = z.object({
  type: z.literal("attach"),
  workOrderId: z.string().describe("Id of the open Work Order this Message is about"),
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
 * The complete set of changes the agent wants to make in response to one
 * Message. A Proposal changes nothing until it is applied.
 */
export const ProposalSchema = z.object({
  classification: z.enum(["maintenance", "not-maintenance"]),
  operations: z
    .array(ProposalOperationSchema)
    .describe("One operation per distinct problem in the Message; empty if it isn't a maintenance matter"),
  reasoning: z.string().describe("Brief reasoning summary for the Coordinator"),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** What the review policy decided to do with a Proposal. */
export const RoutingDecisionSchema = z.object({
  outcome: z.literal("auto-apply"),
  reason: z.string(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

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
]);
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const TraceSchema = z.object({
  messageId: z.string(),
  steps: z.array(TraceStepSchema),
});
export type Trace = z.infer<typeof TraceSchema>;
