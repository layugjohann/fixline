import { z } from "zod";
import { FakeBoard } from "@/board";
import { ReviewQueueEntrySchema, WorkOrderSchema } from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  InvalidEditError,
  ReviewQueueEntryNotResolvableError,
  acknowledgeEmergency,
  approveProposal,
  editProposal,
  rejectProposal,
} from "@/intake";
import { InMemoryReviewQueue, ReviewQueueEntryNotFoundError } from "@/review-queue";

const SandboxSchema = z.object({
  entryId: z.string(),
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

/**
 * A Coordinator's decision on one Review Queue entry. Stateless: the browser
 * sends its sandbox Board and Review Queue, and gets them back updated. An edit
 * carries the edited Proposal, which is validated like the agent's.
 */
const DecisionRequestSchema = z.discriminatedUnion("decision", [
  SandboxSchema.extend({ decision: z.literal("approve") }),
  SandboxSchema.extend({ decision: z.literal("reject"), reason: z.string().optional() }),
  SandboxSchema.extend({ decision: z.literal("acknowledge") }),
  SandboxSchema.extend({ decision: z.literal("edit"), proposal: z.unknown() }),
]);

export async function POST(request: Request): Promise<Response> {
  const parsed = DecisionRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = parsed.data;
  const { entryId } = body;
  const board = new FakeBoard(body.board);
  const reviewQueue = new InMemoryReviewQueue(body.reviewQueue);
  const deps = { board, propertyRoster, reviewQueue };
  try {
    // Set when an approval found the Board had changed and sent the Proposal back to review.
    let conflicts: string[] | undefined;
    switch (body.decision) {
      case "approve": {
        const approval = await approveProposal(entryId, deps);
        if (approval.outcome === "returned-to-review") conflicts = approval.conflicts;
        break;
      }
      case "reject":
        await rejectProposal(entryId, deps, body.reason);
        break;
      case "acknowledge":
        await acknowledgeEmergency(entryId, deps);
        break;
      case "edit":
        await editProposal(entryId, body.proposal, deps);
        break;
    }
    return Response.json({ board: board.snapshot(), reviewQueue: reviewQueue.snapshot(), conflicts });
  } catch (error) {
    if (error instanceof ReviewQueueEntryNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReviewQueueEntryNotResolvableError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidEditError) {
      return Response.json({ error: error.message, problems: error.problems }, { status: 422 });
    }
    throw error;
  }
}
