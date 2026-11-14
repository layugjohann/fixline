import { z } from "zod";
import { FakeBoard } from "@/board";
import { MessageSchema, WorkOrderSchema } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { ModelRateLimitError, NoProposalError, runIntake } from "@/intake";
import { ModelNotConfiguredError, defaultModel } from "@/models";

/**
 * Stateless: the browser sends its sandbox Board with each request, and gets
 * the updated Board back. Nothing is kept on the server between requests.
 */
const IntakeRequestSchema = z.object({
  message: MessageSchema,
  board: z.array(WorkOrderSchema),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = IntakeRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const board = new FakeBoard(parsed.data.board);
  try {
    const result = await runIntake(parsed.data.message, {
      model: defaultModel(),
      board,
      propertyRoster,
    });
    return Response.json({ ...result, board: board.snapshot() });
  } catch (error) {
    if (error instanceof ModelNotConfiguredError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof ModelRateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof NoProposalError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
