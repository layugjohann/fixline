/**
 * Model configuration (ADR 0002). This is the only module that names a model provider;
 * everything else takes an AI SDK `LanguageModel`.
 *
 * A model is chosen by a spec string, `<provider>` or `<provider>:<modelId>`:
 *
 *   groq                      Groq free tier (default)
 *   gemini                    Gemini free tier (fallback)
 *   claude:claude-sonnet-5-5  Claude, with ANTHROPIC_API_KEY or a key supplied per request
 *   openai:gpt-5.5            OpenAI, with OPENAI_API_KEY or a key supplied per request
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { APICallError, RetryError } from "ai";

export const MODEL_PROVIDERS = ["groq", "gemini", "claude", "openai"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** Environment variables model configuration reads (keys, model overrides, FIXLINE_MODEL). */
export type ModelEnv = Readonly<Record<string, string | undefined>>;

/** One provider-agnostic description of which model to use. */
export interface ModelConfig {
  provider: ModelProvider;
  /** Provider-specific model id. Defaults to the provider's env override, then a built-in default. */
  modelId?: string;
  /** An API key for this request only (bring your own key). Defaults to the provider's env var. */
  apiKey?: string;
}

/** A configured model and the name it is recorded under (`provider:modelId`). */
export interface ConfiguredModel {
  model: LanguageModelV4;
  name: string;
}

interface ProviderSettings {
  label: string;
  keyEnv: string;
  modelEnv: string;
  defaultModelId: string;
  create: (apiKey: string, modelId: string) => LanguageModelV4;
}

const PROVIDERS: Record<ModelProvider, ProviderSettings> = {
  groq: {
    label: "Groq",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModelId: "openai/gpt-oss-120b",
    create: (apiKey, modelId) => createGroq({ apiKey })(modelId),
  },
  gemini: {
    label: "Gemini",
    keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModelId: "gemini-3.8-flash",
    create: (apiKey, modelId) => createGoogle({ apiKey })(modelId),
  },
  claude: {
    label: "Claude",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModelId: "claude-sonnet-5-5",
    create: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModelId: "gpt-5.5",
    create: (apiKey, modelId) => createOpenAI({ apiKey })(modelId),
  },
};

export class ModelNotConfiguredError extends Error {
  constructor(message = "No model is configured. Set GROQ_API_KEY (see .env.example).") {
    super(message);
    this.name = "ModelNotConfiguredError";
  }
}

export function isModelProvider(value: string): value is ModelProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value);
}

/** Parse `<provider>` or `<provider>:<modelId>`, such as `gemini` or `groq:openai/gpt-oss-20b`. */
export function parseModelSpec(spec: string): ModelConfig {
  const separator = spec.indexOf(":");
  const provider = (separator === -1 ? spec : spec.slice(0, separator)).trim().toLowerCase();
  const modelId = separator === -1 ? undefined : spec.slice(separator + 1).trim() || undefined;
  if (!isModelProvider(provider)) {
    throw new ModelNotConfiguredError(
      `Unknown model provider "${provider}". Use one of: ${MODEL_PROVIDERS.join(", ")}.`,
    );
  }
  return { provider, modelId };
}

/** Build exactly the model a config describes, with no fallback. */
export function createModel(config: ModelConfig, env: ModelEnv = process.env): ConfiguredModel {
  const settings = PROVIDERS[config.provider];
  const apiKey = config.apiKey || env[settings.keyEnv];
  if (!apiKey) {
    throw new ModelNotConfiguredError(
      `${settings.label} is not configured. Set ${settings.keyEnv} (see .env.example) or supply your own key.`,
    );
  }
  const modelId = config.modelId || env[settings.modelEnv] || settings.defaultModelId;
  return { model: settings.create(apiKey, modelId), name: `${config.provider}:${modelId}` };
}

/**
 * The model to use for live runs.
 *
 * - With FIXLINE_MODEL set (a model spec), exactly that model.
 * - Otherwise Groq's free tier, falling back to Gemini's free tier when Groq is rate-limited.
 *   Either one alone is used without a fallback.
 */
export function configuredModel(env: ModelEnv = process.env): ConfiguredModel {
  if (env.FIXLINE_MODEL) return createModel(parseModelSpec(env.FIXLINE_MODEL), env);

  const groq = env[PROVIDERS.groq.keyEnv] ? createModel({ provider: "groq" }, env) : undefined;
  const gemini = env[PROVIDERS.gemini.keyEnv] ? createModel({ provider: "gemini" }, env) : undefined;
  if (groq && gemini) {
    return { model: withRateLimitFallback(groq.model, gemini.model), name: `${groq.name} (fallback ${gemini.name})` };
  }
  const only = groq ?? gemini;
  if (!only) {
    throw new ModelNotConfiguredError(
      "No model is configured. Set GROQ_API_KEY (and optionally GOOGLE_GENERATIVE_AI_API_KEY) or FIXLINE_MODEL (see .env.example).",
    );
  }
  return only;
}

/**
 * A model that, when a call is refused by a short-lived rate limit (not a used-up quota), waits
 * the provider's `retry-after` (or `defaultWaitSeconds`) and makes the same call again, up to
 * `maxWaits` times. A refused call spends no tokens, so waiting is free; for batch work such as
 * evals on a free tier, where finishing matters more than speed.
 */
export function withRateLimitWait(
  model: LanguageModelV4,
  {
    maxWaits = 5,
    defaultWaitSeconds = 20,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { maxWaits?: number; defaultWaitSeconds?: number; sleep?: (ms: number) => Promise<void> } = {},
): LanguageModelV4 {
  async function withWaits<T>(call: () => PromiseLike<T>): Promise<T> {
    for (let waits = 0; ; waits++) {
      try {
        return await call();
      } catch (error) {
        if (waits >= maxWaits || classifyRateLimit(error) !== "rate-limit") throw error;
        await sleep((retryAfter(error) ?? defaultWaitSeconds) * 1000);
      }
    }
  }
  return {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: (options) => withWaits(() => model.doGenerate(options)),
    doStream: (options) => withWaits(() => model.doStream(options)),
  };
}

/**
 * A model that calls `primary`, and calls `fallback` instead whenever `primary`
 * refuses a call with a rate-limit or quota error.
 */
export function withRateLimitFallback(primary: LanguageModelV4, fallback: LanguageModelV4): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    async doGenerate(options) {
      try {
        return await primary.doGenerate(options);
      } catch (error) {
        if (!classifyRateLimit(error)) throw error;
        return fallback.doGenerate(options);
      }
    },
    async doStream(options) {
      try {
        return await primary.doStream(options);
      } catch (error) {
        if (!classifyRateLimit(error)) throw error;
        return fallback.doStream(options);
      }
    },
  };
}

/** "rate-limit": too many requests for now; "quota": the allowance (daily, credit) is used up. */
export type RateLimitKind = "rate-limit" | "quota";

/** The model provider refused the request because of a rate limit or an exhausted quota. Not an agent failure. */
export class ModelRateLimitError extends Error {
  readonly kind: RateLimitKind;
  /** Seconds the provider asked us to wait, when it said. */
  readonly retryAfterSeconds?: number;

  constructor(options: { kind: RateLimitKind; retryAfterSeconds?: number; cause?: unknown }) {
    const wait = options.retryAfterSeconds === undefined ? "later" : `in ${options.retryAfterSeconds}s`;
    super(
      options.kind === "quota"
        ? "The model provider's quota is used up. Try again later, or use another model or your own key."
        : `The model provider's rate limit was reached. Try again ${wait}.`,
      { cause: options.cause },
    );
    this.name = "ModelRateLimitError";
    this.kind = options.kind;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

const QUOTA_PATTERN = /quota|insufficient_quota|resource_exhausted|per day|daily|billing|credit balance/i;
const RATE_LIMIT_PATTERN = /rate.?limit|too many requests/i;
const PER_MINUTE_PATTERN = /per minute|\((?:TPM|RPM)\)/i;

/** If `error` is a provider rate-limit or quota refusal (after the SDK's own retries), describe it. */
export function toModelRateLimitError(error: unknown): ModelRateLimitError | undefined {
  if (error instanceof ModelRateLimitError) return error;
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  const kind = classifyRateLimit(cause);
  if (!kind) return undefined;
  return new ModelRateLimitError({ kind, retryAfterSeconds: retryAfter(cause), cause: error });
}

const REJECTED_TOOL_CALL_PATTERN = /tool call validation failed|did not call a tool/i;

/**
 * If the provider refused the model's own output because its tool call was invalid (a tool that
 * doesn't exist, input that breaks the schema, or no tool call when one was required), the
 * provider's explanation. That is the model's mistake, not an infrastructure error. Groq checks
 * tool calls server-side and reports them this way.
 */
export function rejectedToolCall(error: unknown): string | undefined {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (!APICallError.isInstance(cause) || cause.statusCode !== 400) return undefined;
  return REJECTED_TOOL_CALL_PATTERN.test(cause.message) ? cause.message : undefined;
}

function classifyRateLimit(error: unknown): RateLimitKind | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  const text = `${error.message} ${error.responseBody ?? ""}`;
  if (error.statusCode === 429) {
    // A per-minute limit clears in seconds, even when the message also links to a billing page (Groq's do).
    if (PER_MINUTE_PATTERN.test(text)) return "rate-limit";
    return QUOTA_PATTERN.test(text) ? "quota" : "rate-limit";
  }
  // Some providers report an exhausted allowance with another status code.
  if (error.statusCode === 402 || (error.statusCode === 403 && QUOTA_PATTERN.test(text))) return "quota";
  if (RATE_LIMIT_PATTERN.test(error.message)) return "rate-limit";
  return undefined;
}

function retryAfter(error: unknown): number | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  const header = error.responseHeaders?.["retry-after"];
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}
