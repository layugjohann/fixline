import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/domain";
import { incomingMessages, sandboxBoard, sandboxReviewQueue } from "@/fixtures";
import type { ModelConfig } from "@/models";
import {
  DailyLiveRunLimiter,
  InMemoryCounter,
  UpstashCounter,
  createLiveIntakeHandler,
  type Counter,
  type DailyLimits,
  type LiveIntakeDependencies,
} from "@/live";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const notMaintenance: Proposal = {
  classification: "not-maintenance",
  operations: [],
  uncertain: false,
  draftReplies: [],
  reasoning: "Not a maintenance matter.",
};

function submittingModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        { type: "tool-call", toolCallId: "call-1", toolName: "submitProposal", input: JSON.stringify(notMaintenance) },
      ],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

const VISITOR_KEY = "sk-ant-visitor-secret-0123456789";

function setUp(limits: DailyLimits = { perVisitor: 2, global: 5 }, ownModel?: LiveIntakeDependencies["ownModel"]) {
  const counter = new InMemoryCounter();
  const sharedModel = submittingModel();
  const ownModelConfigs: ModelConfig[] = [];
  const handler = createLiveIntakeHandler({
    limiter: new DailyLiveRunLimiter(counter, limits),
    sharedModel: () => ({ model: sharedModel, name: "groq:shared" }),
    ownModel:
      ownModel ??
      ((config) => {
        ownModelConfigs.push(config);
        return { model: submittingModel(), name: `${config.provider}:${config.modelId ?? "default"}` };
      }),
  });
  return { counter, sharedModel, ownModelConfigs, handler };
}

function liveRequest(visitorIp: string, extra: object = {}) {
  return new Request("http://localhost/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${visitorIp}, 10.0.0.1` },
    body: JSON.stringify({ message: incomingMessages[0], board: sandboxBoard, reviewQueue: sandboxReviewQueue, ...extra }),
  });
}

const ownKey = { provider: "claude", apiKey: VISITOR_KEY, modelId: "claude-opus-5-5" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Live mode rate limits", () => {
  it("refuses a visitor's shared-key run past their daily limit, with guidance to replay or their own key", async () => {
    const { handler, sharedModel } = setUp({ perVisitor: 2, global: 100 });

    expect((await handler(liveRequest("203.0.113.1"))).status).toBe(200);
    expect((await handler(liveRequest("203.0.113.1"))).status).toBe(200);
    const refused = await handler(liveRequest("203.0.113.1"));

    expect(refused.status).toBe(429);
    const body = (await refused.json()) as { error: string; liveRunLimit: string };
    expect(body.liveRunLimit).toBe("visitor");
    expect(body.error).toMatch(/Demo workspace/);
    expect(body.error).toMatch(/your own Claude or OpenAI key/);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    // The refused run never reached the model.
    expect(sharedModel.doGenerateCalls).toHaveLength(2);
    // Another visitor still has their own allowance.
    expect((await handler(liveRequest("198.51.100.7"))).status).toBe(200);
  });

  it("caps shared-key runs across all visitors per day", async () => {
    const { handler } = setUp({ perVisitor: 10, global: 2 });

    expect((await handler(liveRequest("203.0.113.1"))).status).toBe(200);
    expect((await handler(liveRequest("203.0.113.2"))).status).toBe(200);
    const refused = await handler(liveRequest("203.0.113.3"));

    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ liveRunLimit: "global" });
  });

  it("resets the limits the next UTC day", async () => {
    const limiter = new DailyLiveRunLimiter(new InMemoryCounter(), { perVisitor: 1, global: 1 });
    const today = new Date("2026-11-17T23:59:00Z");

    expect(await limiter.take("visitor", today)).toEqual({ allowed: true });
    expect(await limiter.take("visitor", today)).toEqual({ allowed: false, limit: "visitor", retryAfterSeconds: 60 });
    expect(await limiter.take("visitor", new Date("2026-11-18T00:00:01Z"))).toEqual({ allowed: true });
  });

  it("doesn't count a visitor's refused runs against the global cap", async () => {
    const limiter = new DailyLiveRunLimiter(new InMemoryCounter(), { perVisitor: 1, global: 2 });

    await limiter.take("greedy");
    await limiter.take("greedy");
    await limiter.take("greedy");

    expect(await limiter.take("someone-else")).toEqual({ allowed: true });
  });

  it("refuses shared-key runs with guidance when the limits can't be checked", async () => {
    const failing: Counter = { increment: () => Promise.reject(new Error("unreachable")) };
    const handler = createLiveIntakeHandler({
      limiter: new DailyLiveRunLimiter(failing),
      sharedModel: () => ({ model: submittingModel(), name: "groq:shared" }),
      ownModel: () => ({ model: submittingModel(), name: "claude:own" }),
    });

    const response = await handler(liveRequest("203.0.113.1"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ liveRunLimit: "unavailable" });
  });

  it("counts runs in Upstash with an expiring counter", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json([{ result: 3 }, { result: 1 }]));
    const counter = new UpstashCounter("https://example.upstash.io/", "upstash-token", fetchImpl);

    expect(await counter.increment("fixline:test", 60)).toBe(3);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.upstash.io/pipeline");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer upstash-token");
    expect(JSON.parse(String(init?.body))).toEqual([
      ["INCR", "fixline:test"],
      ["EXPIRE", "fixline:test", "60", "NX"],
    ]);
  });
});

describe("Bring your own key", () => {
  it("skips the shared limits and runs on the visitor's chosen model", async () => {
    const { handler, counter, sharedModel, ownModelConfigs } = setUp({ perVisitor: 1, global: 1 });
    expect((await handler(liveRequest("203.0.113.1"))).status).toBe(200);
    expect((await handler(liveRequest("203.0.113.1"))).status).toBe(429);
    const keysBefore = counter.keys();

    const response = await handler(liveRequest("203.0.113.1", { ownKey }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: "claude:claude-opus-5-5", proposal: notMaintenance });
    expect(ownModelConfigs).toEqual([{ provider: "claude", modelId: "claude-opus-5-5", apiKey: VISITOR_KEY }]);
    expect(sharedModel.doGenerateCalls).toHaveLength(1);
    // Nothing was counted for the own-key run.
    expect(counter.keys()).toEqual(keysBefore);
  });

  it("never stores, logs or returns the visitor's key", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { handler, counter } = setUp();

    const success = await handler(liveRequest("203.0.113.1", { ownKey }));
    const successText = await success.text();

    expect(success.status).toBe(200);
    expect(successText).not.toContain(VISITOR_KEY);
    expect(counter.keys().join(" ")).not.toContain(VISITOR_KEY);
    for (const spy of logged) expect(JSON.stringify(spy.mock.calls)).not.toContain(VISITOR_KEY);
  });

  it("keeps the key out of the response even when the provider's error quotes it", async () => {
    const leakyError = new Error(`Provider exploded handling key ${VISITOR_KEY}`);
    const { handler } = setUp(undefined, () => ({
      model: new MockLanguageModelV4({ doGenerate: () => Promise.reject(leakyError) }),
      name: "claude:own",
    }));

    const response = await handler(liveRequest("203.0.113.1", { ownKey }));

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(VISITOR_KEY);
  });

  it("tells the visitor when their key is rejected", async () => {
    const unauthorised = new APICallError({
      message: "invalid x-api-key",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    });
    const { handler } = setUp(undefined, () => ({
      model: new MockLanguageModelV4({ doGenerate: () => Promise.reject(unauthorised) }),
      name: "claude:own",
    }));

    const response = await handler(liveRequest("203.0.113.1", { ownKey }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Claude (Anthropic) rejected your key. Check it and try again." });
  });
});
