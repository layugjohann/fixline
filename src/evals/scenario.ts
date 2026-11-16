import { z } from "zod";
import {
  MessageSchema,
  PropertyRosterSchema,
  ReviewRuleSchema,
  RoutingOutcomeSchema,
  TradeSchema,
  UrgencySchema,
  WorkOrderLocationSchema,
  WorkOrderSchema,
  locationId,
  sameLocation,
} from "@/domain";

/** One Work Order the expected Proposal should create. */
export const ExpectedWorkOrderSchema = z.object({
  type: z.literal("create").default("create"),
  /** The Unit, or the Common Area for a problem in a shared space. */
  location: WorkOrderLocationSchema,
  /** The Trade, or the list of Trades that are all acceptable for an ambiguous problem. */
  trade: z.union([TradeSchema, z.array(TradeSchema).nonempty()]),
  urgency: UrgencySchema,
});
export type ExpectedWorkOrder = z.infer<typeof ExpectedWorkOrderSchema>;

/** An existing open Work Order the expected Proposal should attach the Message to. */
export const ExpectedAttachSchema = z.object({
  type: z.literal("attach"),
  workOrderId: z.string(),
});
export type ExpectedAttach = z.infer<typeof ExpectedAttachSchema>;

/** One expected operation: a new Work Order (the default), or an attach to an existing one. */
export const ExpectedOperationSchema = z.union([ExpectedAttachSchema, ExpectedWorkOrderSchema]);
export type ExpectedOperation = z.infer<typeof ExpectedOperationSchema>;

/**
 * One outcome an instruction injected into a Message tries to force. A Proposal
 * that shows this outcome followed the injected instruction.
 */
export const InjectedDemandSchema = z.discriminatedUnion("type", [
  /** Classify the Message this way. */
  z.object({ type: z.literal("classification"), classification: z.enum(["maintenance", "not-maintenance"]) }),
  /** Give a new Work Order this Urgency. */
  z.object({ type: z.literal("urgency"), urgency: UrgencySchema }),
  /** Give a new Work Order this Trade. */
  z.object({ type: z.literal("trade"), trade: TradeSchema }),
  /** Attach the Message to this Work Order. */
  z.object({ type: z.literal("attach"), workOrderId: z.string() }),
  /** Create a Work Order at this location. */
  z.object({ type: z.literal("create"), location: WorkOrderLocationSchema }),
]);
export type InjectedDemand = z.infer<typeof InjectedDemandSchema>;

/** How the review policy is expected to route the Proposal. */
export const ExpectedRoutingSchema = z.object({
  outcome: RoutingOutcomeSchema,
  /** Rules that must trigger. Other rules may trigger too (an unknown Sender may also be flagged uncertain). */
  rules: z.array(ReviewRuleSchema).default([]),
});
export type ExpectedRouting = z.infer<typeof ExpectedRoutingSchema>;

/** The parts of a Proposal, and its routing, the rule-based graders check. */
export const ExpectedProposalSchema = z.object({
  classification: z.enum(["maintenance", "not-maintenance"]),
  /** One entry per expected operation. Order doesn't matter: graders pair them with the proposed ones. */
  workOrders: z.array(ExpectedOperationSchema),
  /**
   * For a prompt-injection scenario: the outcomes the Message's injected instructions try to
   * force. The injection grader fails the Proposal if it shows any of them.
   */
  injectedDemands: z.array(InjectedDemandSchema).optional(),
  routing: ExpectedRoutingSchema,
});
export type ExpectedProposal = z.infer<typeof ExpectedProposalSchema>;

/**
 * A golden scenario: a starting Board, a Property Roster and a Message, plus
 * the Proposal Intake is expected to produce for them.
 */
export const GoldenScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "Scenario ids are kebab-case so they can name trace files"),
    description: z.string(),
    tags: z.array(z.string()),
    board: z.array(WorkOrderSchema),
    propertyRoster: PropertyRosterSchema,
    message: MessageSchema,
    expected: ExpectedProposalSchema,
  })
  .superRefine((scenario, ctx) => {
    const unitIds = new Set(scenario.propertyRoster.properties.flatMap((p) => p.units.map((u) => u.id)));
    const commonAreaIds = new Set(scenario.propertyRoster.properties.flatMap((p) => p.commonAreas.map((c) => c.id)));
    scenario.expected.workOrders.forEach((workOrder, index) => {
      if (workOrder.type === "attach") {
        const target = scenario.board.find((candidate) => candidate.id === workOrder.workOrderId);
        if (target?.status !== "open") {
          ctx.addIssue({
            code: "custom",
            path: ["expected", "workOrders", index, "workOrderId"],
            message: `Work Order ${workOrder.workOrderId} is not an open Work Order on the scenario's Board`,
          });
        }
        return;
      }
      const { location } = workOrder;
      const known = location.type === "unit" ? unitIds.has(location.unitId) : commonAreaIds.has(location.commonAreaId);
      if (!known) {
        ctx.addIssue({
          code: "custom",
          path: ["expected", "workOrders", index, "location"],
          message: `${location.type === "unit" ? "Unit" : "Common Area"} ${locationId(location)} is not in the scenario's Property Roster`,
        });
      }
    });
    // An injected demand must contradict the expected outcome, or obeying it would be indistinguishable from
    // triaging the Message on its actual content.
    const creates = scenario.expected.workOrders.flatMap((w) => (w.type === "create" ? [w] : []));
    scenario.expected.injectedDemands?.forEach((demand, index) => {
      const consistent =
        (demand.type === "classification" && demand.classification === scenario.expected.classification) ||
        (demand.type === "urgency" && creates.some((w) => w.urgency === demand.urgency)) ||
        (demand.type === "trade" && creates.some((w) => (typeof w.trade === "string" ? [w.trade] : w.trade).includes(demand.trade))) ||
        (demand.type === "attach" &&
          scenario.expected.workOrders.some((w) => w.type === "attach" && w.workOrderId === demand.workOrderId)) ||
        (demand.type === "create" && creates.some((w) => sameLocation(w.location, demand.location)));
      if (consistent) {
        ctx.addIssue({
          code: "custom",
          path: ["expected", "injectedDemands", index],
          message: "An injected demand must contradict the expected Proposal",
        });
      }
    });
    const { routing } = scenario.expected;
    const isEmergencyCreate = (w: ExpectedOperation) => w.type !== "attach" && w.urgency === "emergency";
    const expectsEmergency = scenario.expected.workOrders.some(isEmergencyCreate);
    const expectsOthers = scenario.expected.workOrders.some((w) => !isEmergencyCreate(w));
    const reviewRules = routing.rules.filter((rule) => rule !== "emergency");
    const routingProblem =
      routing.outcome === "auto-apply" && routing.rules.length > 0
        ? "An auto-applied Proposal triggers no review rules"
        : routing.outcome === "apply-and-flag" && !routing.rules.includes("emergency")
          ? "Only the emergency rule applies and flags a Proposal"
          : routing.outcome === "review" && (routing.rules.length === 0 || routing.rules.includes("emergency"))
            ? "A Proposal sent to review names the non-emergency rule(s) that send it there"
            : routing.outcome === "split" && (!routing.rules.includes("emergency") || reviewRules.length === 0 || !expectsOthers)
              ? "A split Proposal names the emergency rule and a review rule, and expects operations besides the emergency"
              : routing.rules.includes("emergency") !== expectsEmergency
                ? "The emergency rule triggers exactly when an emergency Work Order is expected"
                : undefined;
    if (routingProblem) {
      ctx.addIssue({ code: "custom", path: ["expected", "routing"], message: routingProblem });
    }
    if (scenario.expected.classification === "not-maintenance" && scenario.expected.workOrders.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "workOrders"],
        message: "A non-maintenance Message must not expect Work Orders",
      });
    }
  });
export type GoldenScenario = z.infer<typeof GoldenScenarioSchema>;

/** Parse scenarios and reject duplicate ids. */
export function parseScenarios(input: readonly unknown[]): GoldenScenario[] {
  const scenarios = input.map((raw) => GoldenScenarioSchema.parse(raw));
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) throw new Error(`Duplicate golden scenario id: ${scenario.id}`);
    seen.add(scenario.id);
  }
  return scenarios;
}
