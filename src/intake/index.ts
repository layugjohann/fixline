import type { LanguageModel } from "ai";
import { readOnlyBoard, type Board } from "@/board";
import type { Message, Proposal, PropertyRoster, ReviewQueueEntry, RoutingDecision, Trace, WorkOrder } from "@/domain";
import type { ReviewQueue } from "@/review-queue";
import { runAgent } from "./agent";
import { applyProposal, type AppliedChanges } from "./applier";
import { lookUpSender } from "./property-roster";
import { decideRouting } from "./review-policy";

export { ModelRateLimitError, NoProposalError } from "./agent";
export {
  ReviewQueueEntryNotResolvableError,
  acknowledgeEmergency,
  approveProposal,
  rejectProposal,
  type CoordinatorDependencies,
} from "./coordinator";

export interface IntakeDependencies {
  model: LanguageModel;
  board: Board;
  propertyRoster: PropertyRoster;
  reviewQueue: ReviewQueue;
}

export interface IntakeResult extends AppliedChanges {
  proposal: Proposal;
  routing: RoutingDecision;
  trace: Trace;
  /** The Review Queue entry, when the Proposal was sent for review or flagged as an emergency. */
  reviewQueueEntry?: ReviewQueueEntry;
}

/**
 * The single Intake entry point: turns one Message into one Proposal, routes it
 * through the review policy, then applies it to the Board, sends it to the
 * Review Queue, or (for an emergency) does both.
 */
export async function runIntake(message: Message, deps: IntakeDependencies): Promise<IntakeResult> {
  // The agent only gets read-only dependencies; it never sees the Board's write methods.
  const { proposal, steps } = await runAgent(message, {
    model: deps.model,
    propertyRoster: deps.propertyRoster,
    board: readOnlyBoard(deps.board),
  });

  const sender = lookUpSender(deps.propertyRoster, message.sender);
  const senderTenantId = sender.found ? sender.tenant.id : undefined;
  const attachTargets: WorkOrder[] = [];
  for (const operation of proposal.operations) {
    if (operation.type !== "attach") continue;
    const target = await deps.board.getWorkOrder(operation.workOrderId);
    if (target) attachTargets.push(target);
  }
  const routing = decideRouting(proposal, { senderTenantId, attachTargets });

  const changes: AppliedChanges =
    routing.outcome === "review"
      ? { createdWorkOrders: [], updatedWorkOrders: [] }
      : await applyProposal(proposal, message, deps.board, senderTenantId);

  const reviewQueueEntry =
    routing.outcome === "auto-apply"
      ? undefined
      : await deps.reviewQueue.enqueue({
          message,
          proposal,
          routing,
          status: routing.outcome === "apply-and-flag" ? "flagged" : "pending",
        });

  return {
    proposal,
    routing,
    ...changes,
    ...(reviewQueueEntry ? { reviewQueueEntry } : {}),
    trace: {
      messageId: message.id,
      steps: [...steps, { type: "proposal", proposal }, { type: "routing", decision: routing }],
    },
  };
}
