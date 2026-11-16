import type { LanguageModel } from "ai";
import { readOnlyBoard, type Board } from "@/board";
import type { Message, Proposal, PropertyRoster, RoutingDecision, Trace, WorkOrder } from "@/domain";
import { runAgent } from "./agent";
import { applyProposal } from "./applier";
import { decideRouting } from "./review-policy";

export { NoProposalError } from "./agent";
export { ModelRateLimitError } from "@/models";

export interface IntakeDependencies {
  model: LanguageModel;
  board: Board;
  propertyRoster: PropertyRoster;
}

export interface IntakeResult {
  proposal: Proposal;
  routing: RoutingDecision;
  trace: Trace;
  /** Work Orders created on the Board by applying the Proposal. */
  createdWorkOrders: WorkOrder[];
  /** Existing Work Orders the Proposal attached this Message to, as they are after the update. */
  updatedWorkOrders: WorkOrder[];
}

/**
 * The single Intake entry point: turns one Message into one Proposal, routes it
 * through the review policy and applies it to the Board when the policy allows.
 */
export async function runIntake(message: Message, deps: IntakeDependencies): Promise<IntakeResult> {
  // The agent only gets read-only dependencies; it never sees the Board's write methods.
  const { proposal, steps } = await runAgent(message, {
    model: deps.model,
    propertyRoster: deps.propertyRoster,
    board: readOnlyBoard(deps.board),
  });

  const routing = decideRouting(proposal);
  const changes =
    routing.outcome === "auto-apply"
      ? await applyProposal(proposal, message, deps.board)
      : { createdWorkOrders: [], updatedWorkOrders: [] };

  return {
    proposal,
    routing,
    ...changes,
    trace: {
      messageId: message.id,
      steps: [...steps, { type: "proposal", proposal }, { type: "routing", decision: routing }],
    },
  };
}
