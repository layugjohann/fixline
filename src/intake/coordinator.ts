import type { Board } from "@/board";
import type { PropertyRoster, ReviewQueueEntry, ReviewQueueEntryStatus, WorkOrder } from "@/domain";
import { ReviewQueueEntryNotFoundError, type ReviewQueue } from "@/review-queue";
import { applyProposal, attachTargetsOf, findConflicts, type AppliedChanges } from "./applier";
import { lookUpSender } from "./property-roster";
import { validateProposal } from "./validation";

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

/** A Coordinator's edit doesn't make a valid Proposal. The entry is left as it was. */
export class InvalidEditError extends Error {
  constructor(
    readonly entryId: string,
    readonly problems: string[],
  ) {
    super(`The edited Proposal for Review Queue entry ${entryId} is invalid: ${problems.join(" ")}`);
    this.name = "InvalidEditError";
  }
}

/**
 * What approving did: the Proposal was applied, or it no longer fits the Board
 * as it is now and went back to review with the conflicts recorded on the entry.
 */
export type ApprovalResult =
  | (AppliedChanges & { outcome: "applied"; entry: ReviewQueueEntry })
  | { outcome: "returned-to-review"; conflicts: string[]; entry: ReviewQueueEntry };

/**
 * Approve a pending Proposal. It is first checked against the Board as it is
 * now: if a Work Order it attaches to changed, closed or disappeared since the
 * Proposal was queued, or it no longer passes Proposal validation, nothing is
 * applied. The entry goes back to review with the conflicts recorded and its
 * view of those Work Orders refreshed, so a Coordinator can look again, edit it,
 * then approve or reject it. Otherwise it is applied and marked approved.
 */
export async function approveProposal(entryId: string, deps: CoordinatorDependencies): Promise<ApprovalResult> {
  const entry = await entryWithStatus(entryId, "pending", "approved", deps.reviewQueue);
  const conflicts = await findConflicts(entry.proposal, deps, entry.attachTargets);
  if (conflicts.length > 0) {
    return {
      outcome: "returned-to-review",
      conflicts,
      entry: await deps.reviewQueue.update(entryId, {
        conflicts,
        attachTargets: await attachTargetsOf(entry.proposal, deps.board),
      }),
    };
  }

  const sender = lookUpSender(deps.propertyRoster, entry.message.sender);
  const changes = await applyProposal(
    entry.proposal,
    entry.message,
    deps.board,
    sender.found ? sender.tenant.id : undefined,
  );
  return { outcome: "applied", ...changes, entry: await deps.reviewQueue.setStatus(entryId, "approved") };
}

/**
 * Replace a pending Proposal's operations and labels with a Coordinator's edit,
 * before approving it. The edit must pass Proposal validation against the Board
 * as it is now. The agent's original Proposal is kept on the entry for the record.
 */
export async function editProposal(
  entryId: string,
  edited: unknown,
  deps: CoordinatorDependencies,
): Promise<ReviewQueueEntry> {
  const entry = await entryWithStatus(entryId, "pending", "edited", deps.reviewQueue);
  const validation = await validateProposal(edited, deps);
  if (!validation.valid) throw new InvalidEditError(entryId, validation.problems);
  // Work Orders the entry already attached to keep the state they had when queued, so a change
  // since then still counts as a conflict. Newly added targets are taken as the Coordinator sees them now.
  const current = await attachTargetsOf(validation.proposal, deps.board);
  const attachTargets: WorkOrder[] = current.map(
    (target) => entry.attachTargets.find((known) => known.id === target.id) ?? target,
  );
  return deps.reviewQueue.update(entryId, {
    proposal: validation.proposal,
    agentProposal: entry.agentProposal ?? entry.proposal,
    attachTargets,
  });
}

/**
 * Reject a pending Proposal: the Board is untouched and the rejection, with the
 * Coordinator's reason if they give one, stays on record in the Review Queue.
 */
export async function rejectProposal(
  entryId: string,
  deps: Pick<CoordinatorDependencies, "reviewQueue">,
  reason?: string,
): Promise<ReviewQueueEntry> {
  await entryWithStatus(entryId, "pending", "rejected", deps.reviewQueue);
  const trimmed = reason?.trim();
  return deps.reviewQueue.update(entryId, { status: "rejected", ...(trimmed ? { rejectionReason: trimmed } : {}) });
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
