/**
 * Replays: recorded Intake runs served as static data, so anyone can step through
 * one without a model or a key.
 *
 * A replay wraps a Trace (the one trace format shared by live runs, eval runs and
 * replay) with what a viewer needs to make sense of it: the Message the run was
 * for, the Board it started from, and which model produced it.
 */
import { z } from "zod";
import { MessageSchema, TraceSchema, WorkOrderSchema, type Message, type Trace, type WorkOrder } from "@/domain";

export const ReplaySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "Replay ids are kebab-case so they can name replay files"),
    title: z.string(),
    description: z.string().optional(),
    /** The model that produced the trace, such as `groq:openai/gpt-oss-120b`. */
    model: z.string(),
    /** When the run was recorded (ISO 8601), if known. */
    recordedAt: z.string().optional(),
    message: MessageSchema,
    /** The Board the run started from. */
    board: z.array(WorkOrderSchema),
    trace: TraceSchema,
  })
  .refine((replay) => replay.trace.messageId === replay.message.id, {
    message: "The trace must belong to the replay's Message",
    path: ["trace", "messageId"],
  });
export type Replay = z.infer<typeof ReplaySchema>;

export interface CreateReplayInput {
  id: string;
  title?: string;
  description?: string;
  model: string;
  recordedAt?: string;
  message: Message;
  board?: readonly WorkOrder[];
  trace: Trace;
}

/** Turn a trace from a live or eval run into a replay. Throws if the trace isn't for the Message. */
export function createReplay(input: CreateReplayInput): Replay {
  return ReplaySchema.parse({
    ...input,
    title: input.title ?? input.id,
    board: input.board ?? [],
  });
}

/** Parse a replay from untrusted JSON. */
export function parseReplay(input: unknown): Replay {
  return ReplaySchema.parse(input);
}
