import { isDeepStrictEqual } from "node:util";
import { WorkOrderNotFoundError, type Board, type BoardReader } from "@/board";
import type { Message, Proposal, PropertyRoster, WorkOrder } from "@/domain";
import { validateProposal } from "./validation";

/** An attach targets a Work Order that is closed. The Applier never adds to closed work. */
export class WorkOrderClosedError extends Error {
  constructor(readonly workOrderId: string) {
    super(`Work Order ${workOrderId} is closed, so nothing can be attached to it.`);
    this.name = "WorkOrderClosedError";
  }
}

/** The Work Orders an applied Proposal touched. */
export interface AppliedChanges {
  createdWorkOrders: WorkOrder[];
  updatedWorkOrders: WorkOrder[];
}

/**
 * Applies an approved Proposal to the Board. The only Intake part that writes.
 * Every operation is applied, in order. Attach targets are checked before
 * anything is written, so a missing Work Order can't leave the Board half-changed.
 * Callers validate the Proposal and check it for conflicts (see {@link findConflicts}) first.
 * New Work Orders record the Tenant who raised them (none for an unknown Sender).
 */
export async function applyProposal(
  proposal: Proposal,
  message: Message,
  board: Board,
  raisedByTenantId: string | undefined,
): Promise<AppliedChanges> {
  for (const operation of proposal.operations) {
    if (operation.type !== "attach") continue;
    const target = await board.getWorkOrder(operation.workOrderId);
    if (!target) throw new WorkOrderNotFoundError(operation.workOrderId);
    if (target.status !== "open") throw new WorkOrderClosedError(operation.workOrderId);
  }
  const changes: AppliedChanges = { createdWorkOrders: [], updatedWorkOrders: [] };
  for (const operation of proposal.operations) {
    switch (operation.type) {
      case "create":
        changes.createdWorkOrders.push(
          await board.createWorkOrder({
            location: operation.location,
            title: operation.title,
            description: operation.description,
            trade: operation.trade,
            urgency: operation.urgency,
            messageIds: [message.id],
            ...(raisedByTenantId === undefined ? {} : { raisedByTenantId }),
          }),
        );
        break;
      case "attach":
        changes.updatedWorkOrders.push(
          await board.appendToWorkOrder(operation.workOrderId, {
            information: operation.information,
            messageId: message.id,
          }),
        );
        break;
    }
  }
  return changes;
}

/** The Work Orders a Proposal attaches to, as they are on the Board now. Missing ones are left out. */
export async function attachTargetsOf(proposal: Proposal, board: BoardReader): Promise<WorkOrder[]> {
  const targets: WorkOrder[] = [];
  for (const operation of proposal.operations) {
    if (operation.type !== "attach" || targets.some((target) => target.id === operation.workOrderId)) continue;
    const target = await board.getWorkOrder(operation.workOrderId);
    if (target) targets.push(target);
  }
  return targets;
}

/**
 * Checks a queued Proposal against the Board as it is now, before it is applied.
 * It must still pass Proposal validation (every Work Order it attaches to still
 * on the Board and open, every Unit and Common Area known), and each Work Order
 * it attaches to must be unchanged since the Proposal was queued (or last
 * reviewed). Returns one line per conflict; none means it is safe to apply.
 */
export async function findConflicts(
  proposal: Proposal,
  deps: { board: BoardReader; propertyRoster: PropertyRoster },
  expectedTargets: readonly WorkOrder[],
): Promise<string[]> {
  const validation = await validateProposal(proposal, deps);
  const conflicts = validation.valid ? [] : [...validation.problems];
  for (const current of await attachTargetsOf(proposal, deps.board)) {
    const expected = expectedTargets.find((workOrder) => workOrder.id === current.id);
    // A closed Work Order is already a validation problem.
    if (current.status === "open" && expected && !isDeepStrictEqual(asStored(current), asStored(expected))) {
      conflicts.push(`Work Order ${current.id} changed on the Board since this Proposal was made.`);
    }
  }
  return conflicts;
}

/** A Work Order as it serialises, so a field set to undefined compares equal to one left out. */
function asStored(workOrder: WorkOrder): unknown {
  return JSON.parse(JSON.stringify(workOrder));
}
