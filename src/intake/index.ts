import type { LanguageModel } from "ai";
import { readOnlyBoard, type Board } from "@/board";
import type { Message, Proposal, PropertyRoster, ReviewQueueEntry, RoutingDecision, Trace } from "@/domain";
import type { ReviewQueue } from "@/review-queue";
import { runAgent } from "./agent";
import { applyProposal, attachTargetsOf, type AppliedChanges } from "./applier";
import { lookUpSender } from "./property-roster";
import { decideRouting, splitEmergency, type RoutingContext } from "./review-policy";
import { InvalidProposalError, validateProposal } from "./validation";

export { MAX_REJECTED_TOOL_CALL_RETRIES, NoProposalError, RejectedToolCallError } from "./agent";
export { WorkOrderClosedError } from "./applier";
export { InvalidProposalError } from "./validation";
export { ModelRateLimitError } from "@/models";
export {
  InvalidEditError,
  ReviewQueueEntryNotResolvableError,
  acknowledgeEmergency,
  approveProposal,
  editProposal,
  rejectProposal,
  type ApprovalResult,
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
 *
 * Proposal validation runs before routing: an invalid Proposal (one that breaks
 * the schema, or references a Work Order, Unit or Common Area that doesn't
 * exist, or attaches to a closed Work Order) reaches neither the Board nor the
 * Review Queue. It is rejected with an {@link InvalidProposalError} whose trace
 * records why.
 */
export async function runIntake(message: Message, deps: IntakeDependencies): Promise<IntakeResult> {
  // The agent only gets read-only dependencies; it never sees the Board's write methods.
  const { submitted, steps } = await runAgent(message, {
    model: deps.model,
    propertyRoster: deps.propertyRoster,
    board: readOnlyBoard(deps.board),
  });

  const validation = await validateProposal(submitted, deps);
  if (!validation.valid) {
    throw new InvalidProposalError(validation.problems, {
      messageId: message.id,
      steps: [
        ...steps,
        ...(validation.proposal ? [{ type: "proposal" as const, proposal: validation.proposal }] : []),
        { type: "rejection", problems: validation.problems },
      ],
    });
  }
  const { proposal } = validation;

  const sender = lookUpSender(deps.propertyRoster, message.sender);
  const senderTenantId = sender.found ? sender.tenant.id : undefined;
  const attachTargets = await attachTargetsOf(proposal, deps.board);
  // Read before routing so decideRouting stays pure: it never reads the Board itself.
  const openWorkOrders = (await deps.board.listWorkOrders()).filter((workOrder) => workOrder.status === "open");
  const context: RoutingContext = { senderTenantId, attachTargets, openWorkOrders };
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
  // Each entry records the Work Orders its own operations attach to, so approving it can tell if they changed.
  const targetsOf = (part: Proposal) =>
    context.attachTargets.filter((target) =>
      part.operations.some((operation) => operation.type === "attach" && operation.workOrderId === target.id),
    );
  const nothingApplied: AppliedChanges = { createdWorkOrders: [], updatedWorkOrders: [] };

  switch (routing.outcome) {
    case "auto-apply":
      return { changes: await apply(proposal), reviewQueueEntries: [] };
    case "review":
      return {
        changes: nothingApplied,
        reviewQueueEntries: [await deps.reviewQueue.enqueue({ message, proposal, routing, status: "pending", attachTargets: targetsOf(proposal) })],
      };
    case "apply-and-flag":
      return {
        changes: await apply(proposal),
        reviewQueueEntries: [await deps.reviewQueue.enqueue({ message, proposal, routing, status: "flagged", attachTargets: targetsOf(proposal) })],
      };
    case "split": {
      const { flagged, pending } = splitEmergency(proposal, context);
      const changes = await apply(flagged.proposal);
      return {
        changes,
        reviewQueueEntries: [
          await deps.reviewQueue.enqueue({ message, ...flagged, status: "flagged", attachTargets: targetsOf(flagged.proposal) }),
          await deps.reviewQueue.enqueue({ message, ...pending, status: "pending", attachTargets: targetsOf(pending.proposal) }),
        ],
      };
    }
  }
}
