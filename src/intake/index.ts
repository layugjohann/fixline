import type { LanguageModel } from "ai";
import { readOnlyBoard, type Board } from "@/board";
import type { Message, Proposal, PropertyRoster, ReviewQueueEntry, RoutingDecision, Trace, WorkOrder } from "@/domain";
import type { ReviewQueue } from "@/review-queue";
import { runAgent } from "./agent";
import { applyProposal, type AppliedChanges } from "./applier";
import { lookUpSender } from "./property-roster";
import { decideRouting, splitEmergency, type RoutingContext } from "./review-policy";

export { NoProposalError } from "./agent";
export { ModelRateLimitError } from "@/models";
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
  /**
   * The Review Queue entries this Proposal added: none if auto-applied, one if sent for review
   * or flagged as an emergency, and two if split (the flagged emergency and the pending rest).
   */
  reviewQueueEntries: ReviewQueueEntry[];
}

/**
 * The single Intake entry point: turns one Message into one Proposal, routes it
 * through the review policy, then applies it to the Board, sends it to the
 * Review Queue, or (for an emergency) does both. A split Proposal applies and
 * flags only its emergency creates and sends the rest to the Review Queue.
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
  const context: RoutingContext = { senderTenantId, attachTargets };
  const routing = decideRouting(proposal, context);
  const { changes, reviewQueueEntries } = await carryOut(proposal, routing, message, deps, context);

  return {
    proposal,
    routing,
    ...changes,
    reviewQueueEntries,
    trace: {
      messageId: message.id,
      steps: [...steps, { type: "proposal", proposal }, { type: "routing", decision: routing }],
    },
  };
}

/** Applies and enqueues a routed Proposal as its routing decision says. */
async function carryOut(
  proposal: Proposal,
  routing: RoutingDecision,
  message: Message,
  deps: IntakeDependencies,
  context: RoutingContext,
): Promise<{ changes: AppliedChanges; reviewQueueEntries: ReviewQueueEntry[] }> {
  const apply = (part: Proposal) => applyProposal(part, message, deps.board, context.senderTenantId);
  const nothingApplied: AppliedChanges = { createdWorkOrders: [], updatedWorkOrders: [] };

  switch (routing.outcome) {
    case "auto-apply":
      return { changes: await apply(proposal), reviewQueueEntries: [] };
    case "review":
      return {
        changes: nothingApplied,
        reviewQueueEntries: [await deps.reviewQueue.enqueue({ message, proposal, routing, status: "pending" })],
      };
    case "apply-and-flag":
      return {
        changes: await apply(proposal),
        reviewQueueEntries: [await deps.reviewQueue.enqueue({ message, proposal, routing, status: "flagged" })],
      };
    case "split": {
      const { flagged, pending } = splitEmergency(proposal, context);
      const changes = await apply(flagged.proposal);
      return {
        changes,
        reviewQueueEntries: [
          await deps.reviewQueue.enqueue({ message, ...flagged, status: "flagged" }),
          await deps.reviewQueue.enqueue({ message, ...pending, status: "pending" }),
        ],
      };
    }
  }
}
