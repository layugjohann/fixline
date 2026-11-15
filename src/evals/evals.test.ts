import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { TraceSchema, type Proposal } from "@/domain";
import { goldenScenarios } from "./golden-scenarios";
import { runEvals } from "./runner";
import type { GoldenScenario } from "./scenario";
import { formatScorecard } from "./scorecard";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function toolCallTurn(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

/** The Proposal a perfect agent would submit for a scenario. */
function perfectProposal(scenario: GoldenScenario): Proposal {
  return {
    classification: scenario.expected.classification,
    operations: scenario.expected.workOrders.map((workOrder) => ({
      type: "create",
      unitId: workOrder.unitId,
      title: "Problem",
      description: "Described problem.",
      trade: typeof workOrder.trade === "string" ? workOrder.trade : workOrder.trade[0]!,
      urgency: workOrder.urgency,
    })),
    reasoning: "Scripted.",
  };
}

/**
 * A mock model that, for each Message, looks up the Sender and then submits the
 * Proposal scripted for that Message's id.
 */
function scriptedModel(proposals: Record<string, Proposal>) {
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const promptText = JSON.stringify(prompt);
      const messageId = Object.keys(proposals).find((id) => promptText.includes(`\\"id\\":\\"${id}\\"`));
      if (!messageId) throw new Error("No scripted Proposal for this Message");
      const scenario = goldenScenarios.find((s) => s.message.id === messageId)!;
      const lookedUp = prompt.some((message) => message.role === "tool");
      return lookedUp
        ? toolCallTurn("submitProposal", proposals[messageId])
        : toolCallTurn("lookUpSender", { email: scenario.message.sender.email });
    },
  });
}

function scenario(id: string): GoldenScenario {
  const found = goldenScenarios.find((s) => s.id === id);
  if (!found) throw new Error(`No golden scenario ${id}`);
  return found;
}

let outputDir: string | undefined;
afterEach(async () => {
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
  outputDir = undefined;
});

describe("golden dataset", () => {
  it("has about ten scenarios covering non-maintenance and every Urgency", () => {
    expect(goldenScenarios.length).toBeGreaterThanOrEqual(10);
    const urgencies = new Set(goldenScenarios.flatMap((s) => s.expected.workOrders.map((w) => w.urgency)));
    expect(urgencies).toEqual(new Set(["emergency", "urgent", "routine"]));
    expect(goldenScenarios.some((s) => s.expected.classification === "not-maintenance")).toBe(true);
  });
});

describe("eval runner", () => {
  it("passes every dimension when the agent submits the expected Proposals", async () => {
    const proposals = Object.fromEntries(goldenScenarios.map((s) => [s.message.id, perfectProposal(s)]));

    const { scorecard } = await runEvals(goldenScenarios, { model: scriptedModel(proposals) });

    expect(scorecard.totals).toEqual({
      scenarios: goldenScenarios.length,
      passed: goldenScenarios.length,
      failed: 0,
      errored: 0,
    });
    for (const dimension of scorecard.dimensions) {
      expect(dimension.score).toBe(1);
    }
  });

  it("shows which dimension failed and why", async () => {
    const burstPipe = scenario("emergency-burst-pipe");
    const rent = scenario("not-maintenance-rent-question");
    const wrongUrgency = perfectProposal(burstPipe);
    wrongUrgency.operations[0]!.urgency = "routine";
    const rentAsWorkOrder: Proposal = {
      ...perfectProposal(burstPipe),
      classification: "maintenance",
    };

    const { scorecard } = await runEvals([burstPipe, rent], {
      model: scriptedModel({ [burstPipe.message.id]: wrongUrgency, [rent.message.id]: rentAsWorkOrder }),
    });

    const [pipeResult, rentResult] = scorecard.scenarios;
    expect(pipeResult).toMatchObject({ status: "fail" });
    expect(pipeResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "urgency", status: "fail", detail: "expected emergency, got routine" },
    ]);
    expect(rentResult!.grades).toContainEqual({
      dimension: "classification",
      status: "fail",
      detail: "expected not-maintenance, got maintenance",
    });
    expect(rentResult!.grades).toContainEqual({
      dimension: "unit",
      status: "fail",
      detail: "expected 0 Work Orders, got 1 Work Order",
    });

    const printed = formatScorecard(scorecard);
    expect(printed).toContain("emergency-burst-pipe › urgency: expected emergency, got routine");
    expect(printed).toContain("not-maintenance-rent-question › classification: expected not-maintenance, got maintenance");
  });

  it("writes a machine-readable scorecard and one Intake-format trace per scenario", async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "fixline-evals-"));
    const scenarios = [scenario("urgent-fridge-not-cooling"), scenario("routine-blown-bulb")];
    const proposals = Object.fromEntries(scenarios.map((s) => [s.message.id, perfectProposal(s)]));

    const { scorecard, traces } = await runEvals(scenarios, { model: scriptedModel(proposals), outputDir });

    const written = JSON.parse(await readFile(path.join(outputDir, "scorecard.json"), "utf8"));
    expect(written).toEqual(JSON.parse(JSON.stringify(scorecard)));
    expect((await readdir(path.join(outputDir, "traces"))).sort()).toEqual([
      "routine-blown-bulb.json",
      "urgent-fridge-not-cooling.json",
    ]);
    const trace = TraceSchema.parse(
      JSON.parse(await readFile(path.join(outputDir, "traces", "urgent-fridge-not-cooling.json"), "utf8")),
    );
    expect(trace).toEqual(traces["urgent-fridge-not-cooling"]);
    expect(trace.messageId).toBe("msg-fridge");
    expect(trace.steps).toContainEqual({ type: "proposal", proposal: proposals["msg-fridge"] });
  });

  it("grades a run where the agent never submits a Proposal as a failure on every dimension", async () => {
    const fridge = scenario("urgent-fridge-not-cooling");
    const model = new MockLanguageModelV4({
      doGenerate: async () => toolCallTurn("lookUpSender", { email: fridge.message.sender.email }),
    });

    const { scorecard, traces } = await runEvals([fridge], { model });

    expect(scorecard.scenarios[0]!.status).toBe("fail");
    expect(scorecard.scenarios[0]!.grades.every((g) => g.status === "fail" && g.detail.startsWith("no Proposal"))).toBe(
      true,
    );
    expect(traces[fridge.id]!.steps.some((step) => step.type === "tool-call")).toBe(true);
  });

  it("reports a rate limit as an error, not as an agent failure", async () => {
    const fridge = scenario("urgent-fridge-not-cooling");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "Rate limit reached",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: false,
        });
      },
    });

    const { scorecard } = await runEvals([fridge], { model });

    expect(scorecard.totals).toMatchObject({ failed: 0, errored: 1 });
    expect(scorecard.scenarios[0]).toMatchObject({ status: "error", grades: [] });
    expect(scorecard.scenarios[0]!.error).toContain("ModelRateLimitError");
    expect(scorecard.dimensions.every((d) => d.graded === 0)).toBe(true);
  });
});
