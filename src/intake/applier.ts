import type { Board } from "@/board";
import type { Message, Proposal, WorkOrder } from "@/domain";

/** Applies an approved Proposal to the Board. The only Intake part that writes. */
export async function applyProposal(
  proposal: Proposal,
  message: Message,
  board: Board,
): Promise<WorkOrder[]> {
  const created: WorkOrder[] = [];
  for (const operation of proposal.operations) {
    switch (operation.type) {
      case "create":
        created.push(
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
    }
  }
  return created;
}
