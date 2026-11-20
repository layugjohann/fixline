import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal, TraceStep } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { MAX_REJECTED_TOOL_CALL_RETRIES, ModelRateLimitError, RejectedToolCallError, runIntake } from "@/intake";
import { DailyLiveRunLimiter, InMemoryCounter, createLiveIntakeHandler } from "@/live";
import { InMemoryReviewQueue } from "@/review-queue";

// The provider explanations Groq gave for rejected tool calls in the Issue 15 eval traces.
const REJECTIONS = {
  "an unknown tool (misspelt)":
    "tool call validation failed: attempted to call tool 'lookUpSendeler' which was not in request.tools",
  "an unknown tool (made up)":
    "tool call validation failed: attempted to call tool 'searchOpen.encodeWorkOrders' which was not in request.tools",
  "a missing required input":
    "tool call validation failed: parameters for tool lookUpSender did not match schema: errors: [missing properties: 'email']",
  "an input of the wrong type":
    "tool call validation failed: parameters for tool submitProposal did not match schema: errors: [`/uncertain`: expected boolean, but got string]",
  "no tool call at all": "Tool choice is required, but model did not call a tool",
};

const TOOL_NAMES = ["lookUpSender", "listProperties", "searchOpenWorkOrders", "getWorkOrder", "submitProposal"];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const message: Message = {
  id: "msg-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body: "The kitchen sink tap is dripping and there's a puddle under the cabinet.",
};

const proposal: Proposal = {
  classification: "maintenance",
  operations: [
    {
      type: "create",
      location: { type: "unit", unitId: "harbor-view-2a" },
      title: "Dripping kitchen sink tap",
      description: "Kitchen sink tap drips, with a puddle under the cabinet.",
      trade: "plumbing",
      urgency: "urgent",
    },
  ],
  uncertain: false,
  draftReplies: [],
  reasoning: "One plumbing problem in the Sender's Unit.",
};

function toolCallTurn(toolCallId: string, toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

const lookUp = toolCallTurn("call-lookup", "lookUpSender", { email: message.sender.email });
const submit = toolCallTurn("call-submit", "submitProposal", proposal);

/** A 400 from the provider, the way Groq reports a rejected tool call. */
function providerError(statusCode: number, body: string) {
  return new APICallError({
    message: body,
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode,
    responseBody: body,
    isRetryable: false,
  });
}

/** A mock model that plays `turns` in order: a model response, or an error the provider throws. */
function scriptedModel(turns: Array<ReturnType<typeof toolCallTurn> | Error>) {
  let next = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const turn = turns[Math.min(next++, turns.length - 1)];
      if (turn instanceof Error) throw turn;
      return turn!;
    },
  });
}

function dependencies(model: MockLanguageModelV4) {
  return { model, board: new FakeBoard(), propertyRoster, reviewQueue: new InMemoryReviewQueue() };
}

const stepTypes = (steps: TraceStep[]) => steps.map((step) => (step.type === "tool-call" ? step.toolName : step.type));

describe("rejected tool calls", () => {
  it.each(Object.entries(REJECTIONS))(
    "retries after %s, telling the model why and which tools exist, and keeps the work already done",
    async (_kind, explanation) => {
      const model = scriptedModel([lookUp, providerError(400, explanation), submit]);
      const deps = dependencies(model);

      const result = await runIntake(message, deps);

      // A normal Proposal and routing, as if nothing had been rejected.
      expect(result.proposal).toEqual(proposal);
      expect(result.routing.outcome).toBe("auto-apply");
      expect(await deps.board.listWorkOrders()).toHaveLength(1);

      // The retry carries on from the Sender lookup, told what was rejected and which tools exist.
      expect(model.doGenerateCalls).toHaveLength(3);
      const retryPrompt = JSON.stringify(model.doGenerateCalls[2]!.prompt);
      expect(retryPrompt).toContain(JSON.stringify(JSON.stringify(explanation)).slice(1, -1));
      for (const name of TOOL_NAMES) expect(retryPrompt).toContain(name);
      expect(retryPrompt).toContain("harbor-view-2a"); // the lookUpSender result is kept

      // The trace shows the rejected call and the retry.
      expect(stepTypes(result.trace.steps)).toEqual([
        "lookUpSender",
        "rejected-tool-call",
        "retry",
        "proposal",
        "routing",
      ]);
      expect(result.trace.steps).toContainEqual({ type: "rejected-tool-call", explanation });
      expect(result.trace.steps).toContainEqual({ type: "retry", attempt: 1, maxRetries: 2 });
    },
  );

  it("succeeds on the last retry", async () => {
    const model = scriptedModel([
      providerError(400, REJECTIONS["no tool call at all"]),
      providerError(400, REJECTIONS["an unknown tool (misspelt)"]),
      submit,
    ]);

    const result = await runIntake(message, dependencies(model));

    expect(result.routing.outcome).toBe("auto-apply");
    expect(stepTypes(result.trace.steps)).toEqual([
      "rejected-tool-call",
      "retry",
      "rejected-tool-call",
      "retry",
      "proposal",
      "routing",
    ]);
  });

  it(`gives up after ${MAX_REJECTED_TOOL_CALL_RETRIES} retries, leaving the Board and Review Queue untouched`, async () => {
    const model = scriptedModel([lookUp, providerError(400, REJECTIONS["a missing required input"])]);
    const deps = dependencies(model);

    const error = await runIntake(message, deps).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RejectedToolCallError);
    const rejected = error as RejectedToolCallError;
    expect(rejected.attempts).toBe(3);
    expect(rejected.explanation).toBe(REJECTIONS["a missing required input"]);
    expect(rejected.message).toMatch(/couldn't produce a valid Proposal/);
    expect(model.doGenerateCalls).toHaveLength(4); // the lookup, then three rejected tries
    expect(stepTypes(rejected.trace.steps)).toEqual([
      "lookUpSender",
      "rejected-tool-call",
      "retry",
      "rejected-tool-call",
      "retry",
      "rejected-tool-call",
    ]);
    expect(rejected.trace.messageId).toBe(message.id);
    expect(await deps.board.listWorkOrders()).toHaveLength(0);
    expect(deps.reviewQueue.snapshot()).toHaveLength(0);
  });

  it.each([
    ["a rate limit", providerError(429, "Rate limit reached"), ModelRateLimitError],
    ["a used-up quota", providerError(429, '{"error":{"code":"insufficient_quota"}}'), ModelRateLimitError],
    ["a bad key", providerError(401, "Invalid API key"), APICallError],
    ["a server error", providerError(500, "Internal server error"), APICallError],
    ["another 400", providerError(400, "context_length_exceeded"), APICallError],
  ])("does not retry %s", async (_kind, failure, expected) => {
    const model = scriptedModel([failure]);

    await expect(runIntake(message, dependencies(model))).rejects.toBeInstanceOf(expected);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("answers live mode with a 502 and the trace when every try is rejected", async () => {
    const model = scriptedModel([providerError(400, REJECTIONS["an unknown tool (misspelt)"])]);
    const handler = createLiveIntakeHandler({
      limiter: new DailyLiveRunLimiter(new InMemoryCounter(), { perVisitor: 5, global: 5 }),
      sharedModel: () => ({ model, name: "groq:shared" }),
      ownModel: () => {
        throw new Error("not used");
      },
    });

    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
        body: JSON.stringify({ message, board: [], reviewQueue: [] }),
      }),
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; problems: string[]; trace: { steps: TraceStep[] } };
    expect(body.error).toMatch(/the model couldn't produce a valid Proposal/i);
    expect(body.problems.join(" ")).toContain("lookUpSendeler");
    expect(stepTypes(body.trace.steps)).toEqual([
      "rejected-tool-call",
      "retry",
      "rejected-tool-call",
      "retry",
      "rejected-tool-call",
    ]);
  });
});
