import type { Board } from "@/board";
import type { Message, Proposal, WorkOrder } from "@/domain";

/** The Work Orders an applied Proposal touched. */
export interface AppliedChanges {
  createdWorkOrders: WorkOrder[];
  updatedWorkOrders: WorkOrder[];
}

/** Applies an approved Proposal to the Board. The only Intake part that writes. */
export async function applyProposal(proposal: Proposal, message: Message, board: Board): Promise<AppliedChanges> {
  const changes: AppliedChanges = { createdWorkOrders: [], updatedWorkOrders: [] };
  for (const operation of proposal.operations) {
    switch (operation.type) {
      case "create":
        changes.createdWorkOrders.push(
          await board.createWorkOrder({
            unitId: operation.unitId,
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
