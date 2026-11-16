import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { NoProposalError, runIntake } from "@/intake";
import {
  ModelNotConfiguredError,
  ModelRateLimitError,
  configuredModel,
  createModel,
  parseModelSpec,
  toModelRateLimitError,
  withRateLimitFallback,
} from "@/models";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function toolCallTurn(toolCallId: string, toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

function providerError(statusCode: number, body: string, responseHeaders?: Record<string, string>) {
  return new APICallError({
    message: body,
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode,
    responseHeaders,
    responseBody: body,
    isRetryable: false,
  });
}

const message: Message = {
  id: "msg-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body: "The kitchen sink tap is dripping and there's a puddle under the cabinet.",
};

describe("model configuration", () => {
  it.each([
    ["groq", "GROQ_API_KEY", "groq:openai/gpt-oss-120b"],
    ["gemini", "GOOGLE_GENERATIVE_AI_API_KEY", "gemini:gemini-flash-latest"],
    ["claude", "ANTHROPIC_API_KEY", "claude:claude-sonnet-5-5"],
    ["openai", "OPENAI_API_KEY", "openai:gpt-5.5"],
  ])("selects %s from one provider-agnostic config", (spec, keyEnv, name) => {
    const configured = createModel(parseModelSpec(spec), { [keyEnv]: "test-key" });
    expect(configured.name).toBe(name);
    expect(configured.model.specificationVersion).toBe("v4");
  });

  it("takes a model id from the spec, then the provider's env override", () => {
    expect(createModel(parseModelSpec("groq:openai/gpt-oss-20b"), { GROQ_API_KEY: "k" }).name).toBe(
      "groq:openai/gpt-oss-20b",
    );
    expect(createModel(parseModelSpec("gemini"), { GOOGLE_GENERATIVE_AI_API_KEY: "k", GEMINI_MODEL: "gemini-x" }).name).toBe(
      "gemini:gemini-x",
    );
  });

  it("uses a key supplied with the config instead of the environment (bring your own key)", () => {
    expect(createModel({ provider: "claude", apiKey: "visitor-key" }, {}).name).toBe("claude:claude-sonnet-5-5");
  });

  it("says which key is missing", () => {
    expect(() => createModel({ provider: "openai" }, {})).toThrow(ModelNotConfiguredError);
    expect(() => createModel({ provider: "openai" }, {})).toThrow(/OPENAI_API_KEY/);
    expect(() => configuredModel({})).toThrow(ModelNotConfiguredError);
  });

  it("rejects an unknown provider", () => {
    expect(() => parseModelSpec("mistral")).toThrow(/groq, gemini, claude, openai/);
  });

  it("defaults to Groq with Gemini as fallback, and pins the model named in FIXLINE_MODEL", () => {
    expect(configuredModel({ GROQ_API_KEY: "k" }).name).toBe("groq:openai/gpt-oss-120b");
    expect(configuredModel({ GOOGLE_GENERATIVE_AI_API_KEY: "k" }).name).toBe("gemini:gemini-flash-latest");
    expect(configuredModel({ GROQ_API_KEY: "k", GOOGLE_GENERATIVE_AI_API_KEY: "k" }).name).toBe(
      "groq:openai/gpt-oss-120b (fallback gemini:gemini-flash-latest)",
    );
    expect(configuredModel({ GROQ_API_KEY: "k", FIXLINE_MODEL: "claude", ANTHROPIC_API_KEY: "k" }).name).toBe(
      "claude:claude-sonnet-5-5",
    );
  });
});

describe("rate limits and quotas", () => {
  it("tells a rate limit, an exhausted quota and other errors apart", () => {
    const rateLimited = toModelRateLimitError(providerError(429, "Rate limit reached", { "retry-after": "7" }));
    expect(rateLimited).toMatchObject({ kind: "rate-limit", retryAfterSeconds: 7 });
    expect(rateLimited?.message).toContain("in 7s");

    expect(toModelRateLimitError(providerError(429, '{"error":{"code":"insufficient_quota"}}'))?.kind).toBe("quota");
    expect(toModelRateLimitError(providerError(429, '{"status":"RESOURCE_EXHAUSTED"}'))?.kind).toBe("quota");

    // After the SDK's own retries the provider error arrives wrapped.
    const retried = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [providerError(429, "Too Many Requests")],
    });
    expect(toModelRateLimitError(retried)).toBeInstanceOf(ModelRateLimitError);

    expect(toModelRateLimitError(providerError(401, "Invalid API key"))).toBeUndefined();
    expect(toModelRateLimitError(providerError(500, "Internal error"))).toBeUndefined();
    expect(toModelRateLimitError(new Error("boom"))).toBeUndefined();
  });

  it("surfaces a rate limit from Intake as a ModelRateLimitError, not as a missing Proposal", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError(429, "Rate limit reached");
      },
    });
    const run = runIntake(message, { model, board: new FakeBoard(), propertyRoster });
    await expect(run).rejects.toBeInstanceOf(ModelRateLimitError);
    await expect(run).rejects.not.toBeInstanceOf(NoProposalError);
  });

  it("falls back to the fallback model when the primary is rate-limited", async () => {
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError(429, "Rate limit reached");
      },
    });
    const fallback = new MockLanguageModelV4({
      doGenerate: [
        toolCallTurn("call-1", "lookUpSender", { email: message.sender.email }),
        toolCallTurn("call-2", "submitProposal", {
          classification: "maintenance",
          operations: [
            {
              type: "create",
              location: { type: "unit", unitId: "harbor-view-2a" },
              title: "Dripping kitchen sink tap",
              description: "Kitchen sink tap drips.",
              trade: "plumbing",
              urgency: "urgent",
            },
          ],
          reasoning: "One plumbing problem.",
        }),
      ],
    });
    const board = new FakeBoard();

    const result = await runIntake(message, { model: withRateLimitFallback(primary, fallback), board, propertyRoster });

    expect(result.routing.outcome).toBe("auto-apply");
    expect(await board.listWorkOrders()).toHaveLength(1);
    expect(fallback.doGenerateCalls).toHaveLength(2);
  });

  it("does not fall back on errors that aren't rate limits", async () => {
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError(401, "Invalid API key");
      },
    });
    const fallback = new MockLanguageModelV4({ doGenerate: [] });

    await expect(
      runIntake(message, { model: withRateLimitFallback(primary, fallback), board: new FakeBoard(), propertyRoster }),
    ).rejects.toThrow("Invalid API key");
    expect(fallback.doGenerateCalls).toHaveLength(0);
  });
});
