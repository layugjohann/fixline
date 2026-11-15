import { WorkOrderNotFoundError, type Board } from "@/board";
import type { Message, Proposal, WorkOrder } from "@/domain";

/** The Work Orders an applied Proposal touched. */
export interface AppliedChanges {
  createdWorkOrders: WorkOrder[];
  updatedWorkOrders: WorkOrder[];
}

/**
 * Applies an approved Proposal to the Board. The only Intake part that writes.
 * Every operation is applied, in order. Attach targets are checked before
 * anything is written, so a missing Work Order can't leave the Board half-changed.
 */
export async function applyProposal(proposal: Proposal, message: Message, board: Board): Promise<AppliedChanges> {
  for (const operation of proposal.operations) {
    if (operation.type === "attach" && !(await board.getWorkOrder(operation.workOrderId))) {
      throw new WorkOrderNotFoundError(operation.workOrderId);
    }
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
