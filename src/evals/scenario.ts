import { z } from "zod";
import {
  MessageSchema,
  PropertyRosterSchema,
  TradeSchema,
  UrgencySchema,
  WorkOrderSchema,
} from "@/domain";

/** One Work Order the expected Proposal should create. */
export const ExpectedWorkOrderSchema = z.object({
  type: z.literal("create").default("create"),
  unitId: z.string(),
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

/** The parts of a Proposal the rule-based graders check. */
export const ExpectedProposalSchema = z.object({
  classification: z.enum(["maintenance", "not-maintenance"]),
  /** One entry per expected operation, in order. */
  workOrders: z.array(ExpectedOperationSchema),
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
      if (!unitIds.has(workOrder.unitId)) {
        ctx.addIssue({
          code: "custom",
          path: ["expected", "workOrders", index, "unitId"],
          message: `Unit ${workOrder.unitId} is not in the scenario's Property Roster`,
        });
      }
    });
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
