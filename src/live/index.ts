/**
 * Live mode's request handler: runs Intake on one Message against the sandbox
 * state the browser sends, on either the shared free-tier model (rate-limited per
 * visitor and per day) or the visitor's own key (not rate-limited).
 *
 * Stateless: the browser sends its sandbox Board and Review Queue with each
 * request, and gets them back updated. Nothing is kept on the server between
 * requests, apart from the shared-key run counts.
 */
import { APICallError, RetryError } from "ai";
import { z } from "zod";
import { FakeBoard } from "@/board";
import { MessageSchema, ReviewQueueEntrySchema, WorkOrderSchema } from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  InvalidProposalError,
  ModelRateLimitError,
  NoProposalError,
  RejectedToolCallError,
  runIntake,
} from "@/intake";
import { ModelNotConfiguredError, configuredModel, createModel, type ConfiguredModel, type ModelConfig } from "@/models";
import { InMemoryReviewQueue } from "@/review-queue";
import { OWN_KEY_PROVIDER_LABELS, OwnKeySchema, type OwnKey } from "./own-key";
import {
  LiveRunLimiterUnavailableError,
  configuredLiveRunLimiter,
  visitorOf,
  type LiveRunLimit,
  type LiveRunLimiter,
} from "./rate-limit";

export * from "./own-key";
export * from "./rate-limit";

export const IntakeRequestSchema = z.object({
  message: MessageSchema,
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema).default([]),
  /** Bring your own key: run on this key and model instead of the shared one, skipping the shared limits. */
  ownKey: OwnKeySchema.optional(),
});

export interface LiveIntakeDependencies {
  limiter: LiveRunLimiter;
  /** The shared free-tier model. */
  sharedModel: () => ConfiguredModel;
  /** A model on the visitor's own key. */
  ownModel: (config: ModelConfig) => ConfiguredModel;
}

/** The dependencies the deployed app uses, configured from environment variables. */
export function configuredLiveIntakeDependencies(): LiveIntakeDependencies {
  return {
    limiter: configuredLiveRunLimiter(),
    sharedModel: () => configuredModel(),
    // An empty environment: a visitor's run uses their key and their model, never the server's.
    ownModel: (config) => createModel(config, {}),
  };
}

const LIMIT_GUIDANCE: Record<LiveRunLimit | "unavailable", string> = {
  visitor: "You've used today's live runs on the shared free-tier model.",
  global: "The demo's shared free-tier model has done all its live runs for today.",
  unavailable: "Live runs on the shared free-tier model are unavailable right now.",
};
const LIMIT_NEXT_STEPS =
  "You can keep exploring in replay mode, which needs no model, or paste your own Claude or OpenAI key to keep running live.";

/** Builds live mode's POST handler. */
export function createLiveIntakeHandler(deps: LiveIntakeDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = IntakeRequestSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const { message, ownKey } = parsed.data;
    const board = new FakeBoard(parsed.data.board);
    const reviewQueue = new InMemoryReviewQueue(parsed.data.reviewQueue);

    if (ownKey) return runOnOwnKey(ownKey, deps, async (model) => {
      const result = await runIntake(message, { model: model.model, board, propertyRoster, reviewQueue });
      return { ...result, model: model.name, board: board.snapshot(), reviewQueue: reviewQueue.snapshot() };
    });

    try {
      const model = deps.sharedModel();
      const allowance = await deps.limiter.take(visitorOf(request));
      if (!allowance.allowed) {
        return Response.json(
          {
            error: `${LIMIT_GUIDANCE[allowance.limit]} ${LIMIT_NEXT_STEPS}`,
            liveRunLimit: allowance.limit,
            retryAfterSeconds: allowance.retryAfterSeconds,
          },
          { status: 429, headers: { "Retry-After": String(allowance.retryAfterSeconds) } },
        );
      }
      const result = await runIntake(message, { model: model.model, board, propertyRoster, reviewQueue });
      return Response.json({ ...result, model: model.name, board: board.snapshot(), reviewQueue: reviewQueue.snapshot() });
    } catch (error) {
      if (error instanceof LiveRunLimiterUnavailableError) {
        return Response.json(
          { error: `${LIMIT_GUIDANCE.unavailable} ${LIMIT_NEXT_STEPS}`, liveRunLimit: "unavailable" },
          { status: 503 },
        );
      }
      const known = knownErrorResponse(error);
      if (known) return known;
      throw error;
    }
  };
}

/**
 * Runs on the visitor's own key. The key lives only in this request: it is never
 * stored, logged or traced, and no error that might quote it is rethrown (Next.js
 * would log it) or sent back without the key redacted.
 */
async function runOnOwnKey(
  ownKey: OwnKey,
  deps: LiveIntakeDependencies,
  run: (model: ConfiguredModel) => Promise<object>,
): Promise<Response> {
  const respond = (body: object, init?: ResponseInit) =>
    new Response(JSON.stringify(body).replaceAll(ownKey.apiKey, "[redacted]"), {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  const label = OWN_KEY_PROVIDER_LABELS[ownKey.provider];

  try {
    const model = deps.ownModel({ provider: ownKey.provider, modelId: ownKey.modelId, apiKey: ownKey.apiKey });
    return respond(await run(model));
  } catch (error) {
    const known = knownErrorResponse(error, respond);
    if (known) return known;
    const status = providerStatus(error);
    if (status === 401 || status === 403) {
      return respond({ error: `${label} rejected your key. Check it and try again.` }, { status: 401 });
    }
    if (status === 404) {
      return respond({ error: `${label} doesn't recognise that model. Check the model name, or leave it blank.` }, { status: 400 });
    }
    return respond({ error: `${label} returned an error, so the run didn't finish. Try again in a moment.` }, { status: 502 });
  }
}

/** The response for an error every live run can meet, or undefined for anything else. */
function knownErrorResponse(
  error: unknown,
  respond: (body: object, init?: ResponseInit) => Response = Response.json,
): Response | undefined {
  if (error instanceof ModelNotConfiguredError) {
    return respond({ error: error.message }, { status: 503 });
  }
  if (error instanceof ModelRateLimitError) {
    return respond(
      { error: error.message, rateLimit: error.kind },
      {
        status: 429,
        headers: error.retryAfterSeconds === undefined ? undefined : { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }
  // The provider rejected the model's tool call on every try: the model failed, not the server.
  // The sandbox is unchanged, and the trace shows each rejected call and retry.
  if (error instanceof RejectedToolCallError) {
    return respond(
      {
        error: "The model couldn't produce a valid Proposal, so nothing was changed. Try again, or try another model.",
        problems: [error.message],
        trace: error.trace,
      },
      { status: 502 },
    );
  }
  if (error instanceof NoProposalError) {
    return respond({ error: error.message }, { status: 502 });
  }
  // Proposal validation rejected the agent's Proposal: the sandbox is unchanged, and the
  // trace shows why so the rejection can be recorded and shown.
  if (error instanceof InvalidProposalError) {
    return respond({ error: error.message, problems: error.problems, trace: error.trace }, { status: 422 });
  }
  return undefined;
}

function providerStatus(error: unknown): number | undefined {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(cause) ? cause.statusCode : undefined;
}
