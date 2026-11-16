import { z } from "zod";
import { FakeBoard, WorkOrderNotFoundError } from "@/board";
import { ReviewQueueEntrySchema, WorkOrderSchema } from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  ReviewQueueEntryNotResolvableError,
  acknowledgeEmergency,
  approveProposal,
  rejectProposal,
} from "@/intake";
import { InMemoryReviewQueue, ReviewQueueEntryNotFoundError } from "@/review-queue";

/**
 * A Coordinator's decision on one Review Queue entry. Stateless: the browser
 * sends its sandbox Board and Review Queue, and gets them back updated.
 */
const DecisionRequestSchema = z.object({
  decision: z.enum(["approve", "reject", "acknowledge"]),
  entryId: z.string(),
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = DecisionRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { decision, entryId } = parsed.data;
  const board = new FakeBoard(parsed.data.board);
  const reviewQueue = new InMemoryReviewQueue(parsed.data.reviewQueue);
  try {
    switch (decision) {
      case "approve":
        await approveProposal(entryId, { board, propertyRoster, reviewQueue });
        break;
      case "reject":
        await rejectProposal(entryId, { reviewQueue });
        break;
      case "acknowledge":
        await acknowledgeEmergency(entryId, { reviewQueue });
        break;
    }
    return Response.json({ board: board.snapshot(), reviewQueue: reviewQueue.snapshot() });
  } catch (error) {
    if (error instanceof ReviewQueueEntryNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReviewQueueEntryNotResolvableError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    // The Proposal attaches to a Work Order no longer on the Board.
    // Issue 07 adds the full apply-time conflict check.
    if (error instanceof WorkOrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
