/**
 * A demo visitor's sandbox: their own Board, Review Queue, Incoming Messages and
 * run history. It lives only in the visitor's browser. The server never stores
 * it: each request carries the parts it needs and gets them back updated.
 */
import { z } from "zod";
import {
  MessageSchema,
  ProposalSchema,
  ReviewQueueEntrySchema,
  RoutingDecisionSchema,
  TraceSchema,
  WorkOrderSchema,
  type Message,
  type ReviewQueueEntry,
  type Sender,
  type WorkOrder,
} from "@/domain";
import { incomingMessages, sandboxBoard, sandboxReviewQueue } from "@/fixtures";

/** One Message in the sandbox's Incoming Messages, and whether Intake has processed it yet. */
export const IncomingMessageSchema = z.object({
  message: MessageSchema,
  processed: z.boolean(),
});
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

/** One Intake run in the sandbox: the Message and what Intake did with it. */
export const SandboxRunSchema = z.object({
  message: MessageSchema,
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  trace: TraceSchema,
});
export type SandboxRun = z.infer<typeof SandboxRunSchema>;

/**
 * An Intake run whose Proposal failed Proposal validation. Nothing reached the Board
 * or the Review Queue, and the Message stays unprocessed in Incoming Messages so it can be
 * run again.
 */
export const SandboxRejectionSchema = z.object({
  message: MessageSchema,
  problems: z.array(z.string()),
  trace: TraceSchema,
});
export type SandboxRejection = z.infer<typeof SandboxRejectionSchema>;

/** Bumped whenever the shape changes, so a browser holding an older sandbox is reseeded. */
export const SANDBOX_VERSION = 2;

export const SandboxSchema = z.object({
  version: z.literal(SANDBOX_VERSION),
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
  incomingMessages: z.array(IncomingMessageSchema),
  /** Intake runs, oldest first. */
  history: z.array(SandboxRunSchema),
  /** Proposals that Proposal validation rejected, oldest first. */
  rejections: z.array(SandboxRejectionSchema).default([]),
});
export type Sandbox = z.infer<typeof SandboxSchema>;

/** The browser storage key the sandbox is saved under. */
export const SANDBOX_STORAGE_KEY = "fixline.sandbox";

/** A fresh sandbox seeded from fixtures. Each call returns an independent copy. */
export function seedSandbox(): Sandbox {
  return structuredClone({
    version: SANDBOX_VERSION,
    board: sandboxBoard,
    reviewQueue: sandboxReviewQueue,
    incomingMessages: incomingMessages.map((message) => ({ message, processed: false })),
    history: [],
    rejections: [],
  });
}

/**
 * The sandbox saved in browser storage, or a freshly seeded one on a first visit
 * or when what's stored can't be read (corrupted, or from an older version).
 */
export function loadSandbox(stored: string | null): Sandbox {
  if (stored === null) return seedSandbox();
  try {
    const parsed = SandboxSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : seedSandbox();
  } catch {
    return seedSandbox();
  }
}

/** The sandbox in the form saved to browser storage. */
export function serialiseSandbox(sandbox: Sandbox): string {
  return JSON.stringify(sandbox);
}

/**
 * A new Message sent "as a Tenant" from the sandbox, added to the end of Incoming Messages.
 * The Sender can be a Tenant from the Property Roster or anyone else.
 */
export function sendMessage(
  sandbox: Sandbox,
  sender: Sender,
  body: string,
  receivedAt: string,
): { sandbox: Sandbox; message: Message } {
  const message = MessageSchema.parse({
    id: nextMessageId(sandbox),
    sender: sender.name?.trim() ? { email: sender.email.trim(), name: sender.name.trim() } : { email: sender.email.trim() },
    receivedAt,
    body,
  });
  return {
    sandbox: { ...sandbox, incomingMessages: [...sandbox.incomingMessages, { message, processed: false }] },
    message,
  };
}

/**
 * Record an Intake run on a Message: the Board and Review Queue Intake returned,
 * the Message marked processed, and the run added to the history.
 */
export function recordRun(
  sandbox: Sandbox,
  run: SandboxRun & { board: WorkOrder[]; reviewQueue: ReviewQueueEntry[] },
): Sandbox {
  const { board, reviewQueue, ...record } = run;
  return {
    ...sandbox,
    board,
    reviewQueue,
    incomingMessages: sandbox.incomingMessages.map((item) => (item.message.id === run.message.id ? { ...item, processed: true } : item)),
    history: [...sandbox.history, record],
  };
}

/** Record a Proposal that validation rejected. The Board, Review Queue and Incoming Messages are unchanged. */
export function recordRejection(sandbox: Sandbox, rejection: SandboxRejection): Sandbox {
  return { ...sandbox, rejections: [...sandbox.rejections, rejection] };
}

/** Record a Coordinator's decision on the Review Queue: the Board and Review Queue it left. */
export function recordDecision(
  sandbox: Sandbox,
  result: { board: WorkOrder[]; reviewQueue: ReviewQueueEntry[] },
): Sandbox {
  return { ...sandbox, board: result.board, reviewQueue: result.reviewQueue };
}

function nextMessageId(sandbox: Sandbox): string {
  const highest = sandbox.incomingMessages.reduce((max, item) => {
    const match = /^msg-sandbox-(\d+)$/.exec(item.message.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `msg-sandbox-${highest + 1}`;
}
