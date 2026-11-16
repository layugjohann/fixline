import type { Board } from "@/board";
import type { PropertyRoster, ReviewQueueEntry, ReviewQueueEntryStatus } from "@/domain";
import { ReviewQueueEntryNotFoundError, type ReviewQueue } from "@/review-queue";
import { applyProposal, type AppliedChanges } from "./applier";
import { lookUpSender } from "./property-roster";

/** What a Coordinator's decisions on the Review Queue need. */
export interface CoordinatorDependencies {
  board: Board;
  propertyRoster: PropertyRoster;
  reviewQueue: ReviewQueue;
}

/** The Review Queue entry isn't in a state that allows this decision (for example, it was already approved). */
export class ReviewQueueEntryNotResolvableError extends Error {
  constructor(
    readonly entryId: string,
    readonly status: ReviewQueueEntryStatus,
    action: string,
  ) {
    super(`Review Queue entry ${entryId} is ${status}, so it can't be ${action}.`);
    this.name = "ReviewQueueEntryNotResolvableError";
  }
}

/** Approve a pending Proposal: apply it to the Board, then mark it approved. */
export async function approveProposal(
  entryId: string,
  deps: CoordinatorDependencies,
): Promise<AppliedChanges & { entry: ReviewQueueEntry }> {
  const entry = await entryWithStatus(entryId, "pending", "approved", deps.reviewQueue);
  const sender = lookUpSender(deps.propertyRoster, entry.message.sender);
  // If applying fails, the entry stays pending and the Board is untouched.
  const changes = await applyProposal(
    entry.proposal,
    entry.message,
    deps.board,
    sender.found ? sender.tenant.id : undefined,
  );
  return { ...changes, entry: await deps.reviewQueue.setStatus(entryId, "approved") };
}

/** Reject a pending Proposal: the Board is untouched and the rejection stays on record in the Review Queue. */
export async function rejectProposal(entryId: string, deps: Pick<CoordinatorDependencies, "reviewQueue">): Promise<ReviewQueueEntry> {
  await entryWithStatus(entryId, "pending", "rejected", deps.reviewQueue);
  return deps.reviewQueue.setStatus(entryId, "rejected");
}

/** Acknowledge a flagged emergency, which is already on the Board. */
export async function acknowledgeEmergency(
  entryId: string,
  deps: Pick<CoordinatorDependencies, "reviewQueue">,
): Promise<ReviewQueueEntry> {
  await entryWithStatus(entryId, "flagged", "acknowledged", deps.reviewQueue);
  return deps.reviewQueue.setStatus(entryId, "acknowledged");
}

async function entryWithStatus(
  entryId: string,
  required: ReviewQueueEntryStatus,
  action: string,
  reviewQueue: ReviewQueue,
): Promise<ReviewQueueEntry> {
  const entry = await reviewQueue.get(entryId);
  if (!entry) throw new ReviewQueueEntryNotFoundError(entryId);
  if (entry.status !== required) throw new ReviewQueueEntryNotResolvableError(entryId, entry.status, action);
  return entry;
}
