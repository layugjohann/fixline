import { z } from "zod";
import { FakeBoard, WorkOrderNotFoundError } from "@/board";
import { MessageSchema, ReviewQueueEntrySchema, WorkOrderSchema } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { ModelRateLimitError, NoProposalError, runIntake } from "@/intake";
import { ModelNotConfiguredError, configuredModel } from "@/models";
import { InMemoryReviewQueue } from "@/review-queue";

/**
 * Stateless: the browser sends its sandbox Board and Review Queue with each
 * request, and gets them back updated. Nothing is kept on the server between requests.
 */
const IntakeRequestSchema = z.object({
  message: MessageSchema,
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema).default([]),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = IntakeRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const board = new FakeBoard(parsed.data.board);
  const reviewQueue = new InMemoryReviewQueue(parsed.data.reviewQueue);
  try {
    const result = await runIntake(parsed.data.message, {
      model: configuredModel().model,
      board,
      propertyRoster,
      reviewQueue,
    });
    return Response.json({ ...result, board: board.snapshot(), reviewQueue: reviewQueue.snapshot() });
  } catch (error) {
    if (error instanceof ModelNotConfiguredError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof ModelRateLimitError) {
      return Response.json(
        { error: error.message, rateLimit: error.kind },
        {
          status: 429,
          headers: error.retryAfterSeconds === undefined ? undefined : { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    if (error instanceof NoProposalError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    // The agent proposed attaching to a Work Order that isn't on the Board.
    // Issue 07 adds validation that rejects this before anything is applied.
    if (error instanceof WorkOrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
