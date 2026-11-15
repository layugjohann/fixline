import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { TraceSchema, type Proposal } from "@/domain";
import { propertyRoster } from "@/fixtures";
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
    operations: scenario.expected.workOrders.map((workOrder) =>
      workOrder.type === "attach"
        ? { type: "attach", workOrderId: workOrder.workOrderId, information: "New information." }
        : {
            type: "create",
            location: workOrder.location,
            title: "Problem",
            description: "Described problem.",
            trade: typeof workOrder.trade === "string" ? workOrder.trade : workOrder.trade[0]!,
            urgency: workOrder.urgency,
          },
    ),
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
    const urgencies = new Set(
      goldenScenarios.flatMap((s) => s.expected.workOrders.flatMap((w) => (w.type === "create" ? [w.urgency] : []))),
    );
    expect(urgencies).toEqual(new Set(["emergency", "urgent", "routine"]));
    expect(goldenScenarios.some((s) => s.expected.classification === "not-maintenance")).toBe(true);
  });

  it("covers duplicates, follow-ups and similar-but-different problems that must not be matched", () => {
    const tagged = (tag: string) => goldenScenarios.filter((s) => s.tags.includes(tag));
    const attaches = (s: GoldenScenario) => s.expected.workOrders.some((w) => w.type === "attach");
    expect(tagged("duplicate").length).toBeGreaterThan(0);
    expect(tagged("follow-up").length).toBeGreaterThan(0);
    expect([...tagged("duplicate"), ...tagged("follow-up")].every(attaches)).toBe(true);
    const different = tagged("similar-but-different");
    expect(different.length).toBeGreaterThan(0);
    expect(different.some(attaches)).toBe(false);
    // Each similar-but-different scenario has a lookalike Work Order on its Board to resist.
    expect(different.every((s) => s.board.length > 1)).toBe(true);
  });

  it("covers multi-problem Messages and Common Areas, including a Common Area merge across Units", () => {
    const tagged = (tag: string) => goldenScenarios.filter((s) => s.tags.includes(tag));
    const counts = tagged("multi-problem").map((s) => s.expected.workOrders.length);
    expect(counts).toContain(3);
    expect(
      tagged("multi-problem").some((s) => {
        const types = new Set(s.expected.workOrders.map((w) => w.type));
        return types.has("attach") && types.has("create");
      }),
    ).toBe(true);

    const commonAreaIds = new Set(
      propertyRoster.properties.flatMap((property) => property.commonAreas.map((commonArea) => commonArea.id)),
    );
    expect(commonAreaIds.size).toBeGreaterThan(0);
    const commonAreaScenarios = tagged("common-area");
    expect(
      commonAreaScenarios.some((s) =>
        s.expected.workOrders.some((w) => w.type === "create" && w.location.type === "common-area"),
      ),
    ).toBe(true);
    // A Tenant from one Unit attaches to a Common Area Work Order raised from a different Unit.
    const merge = scenario("common-area-merge-across-units");
    const target = merge.expected.workOrders[0];
    if (target?.type !== "attach") throw new Error("Expected an attach");
    const workOrder = merge.board.find((w) => w.id === target.workOrderId)!;
    expect(workOrder.location.type).toBe("common-area");
    expect(workOrder.messageIds.some((id) => id !== merge.message.id)).toBe(true);
    expect(merge.message.sender.email).not.toBe("luis.romero@example.com");
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
    const pipeOperation = wrongUrgency.operations[0]!;
    if (pipeOperation.type !== "create") throw new Error("Expected a create operation");
    pipeOperation.urgency = "routine";
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
      dimension: "count",
      status: "fail",
      detail: "expected 0 Work Orders, got 1 Work Order",
    });

    const printed = formatScorecard(scorecard);
    expect(printed).toContain("emergency-burst-pipe › urgency: expected emergency, got routine");
    expect(printed).toContain("not-maintenance-rent-question › classification: expected not-maintenance, got maintenance");
  });

  it("grades the match target: a duplicate created instead of attached, and a wrong attach", async () => {
    const duplicate = scenario("match-duplicate-report-same-tenant");
    const different = scenario("no-match-different-fixture-same-unit");
    const createdDuplicate: Proposal = {
      classification: "maintenance",
      operations: [
        {
          type: "create",
          location: { type: "unit", unitId: "harbor-view-2a" },
          title: "Dripping tap",
          description: "Kitchen tap drips.",
          trade: "plumbing",
          urgency: "urgent",
        },
      ],
      reasoning: "Scripted.",
    };
    const wronglyAttached: Proposal = {
      classification: "maintenance",
      operations: [{ type: "attach", workOrderId: "WO-2", information: "Shower drains slowly." }],
      reasoning: "Scripted.",
    };

    const { scorecard } = await runEvals([duplicate, different], {
      model: scriptedModel({ [duplicate.message.id]: createdDuplicate, [different.message.id]: wronglyAttached }),
    });

    const [duplicateResult, differentResult] = scorecard.scenarios;
    expect(duplicateResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "match", status: "fail", detail: "expected WO-2, got new Work Order" },
    ]);
    expect(differentResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "match", status: "fail", detail: "expected new Work Order, got WO-2" },
    ]);
    expect(formatScorecard(scorecard)).toContain("match-duplicate-report-same-tenant › match: expected WO-2, got new Work Order");
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

  it("grades a multi-problem Proposal whatever order its operations come in", async () => {
    const three = scenario("multi-problem-three-problems");
    const twoProblems = scenario("multi-problem-attach-and-create");
    const reversed = perfectProposal(three);
    reversed.operations.reverse();

    const { scorecard } = await runEvals([three, twoProblems], {
      model: scriptedModel({
        [three.message.id]: reversed,
        [twoProblems.message.id]: { ...perfectProposal(twoProblems), operations: perfectProposal(twoProblems).operations.reverse() },
      }),
    });

    expect(scorecard.totals).toMatchObject({ passed: 2, failed: 0 });
    expect(scorecard.scenarios[0]!.grades).toContainEqual({ dimension: "count", status: "pass", detail: "3 Work Orders" });
  });

  it("grades the number of Work Orders and the location (Unit or Common Area) separately", async () => {
    const twoProblems = scenario("multi-problem-attach-and-create");
    const stairwell = scenario("common-area-new-report");
    // Only the heater is picked up; the dripping tap is missed.
    const missedTap: Proposal = {
      ...perfectProposal(twoProblems),
      operations: perfectProposal(twoProblems).operations.filter((operation) => operation.type === "attach"),
    };
    // The stairwell light is recorded against the Sender's Unit instead of the Common Area.
    const inSendersUnit = perfectProposal(stairwell);
    const stairwellOperation = inSendersUnit.operations[0]!;
    if (stairwellOperation.type !== "create") throw new Error("Expected a create operation");
    stairwellOperation.location = { type: "unit", unitId: "harbor-view-2a" };

    const { scorecard } = await runEvals([twoProblems, stairwell], {
      model: scriptedModel({ [twoProblems.message.id]: missedTap, [stairwell.message.id]: inSendersUnit }),
    });

    const [twoResult, stairwellResult] = scorecard.scenarios;
    expect(twoResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "count", status: "fail", detail: "expected 2 Work Orders, got 1 Work Order" },
    ]);
    expect(twoResult!.grades).toContainEqual({ dimension: "match", status: "pass", detail: "Work Order 1: WO-3" });
    expect(stairwellResult!.grades.filter((g) => g.status === "fail")).toEqual([
      {
        dimension: "location",
        status: "fail",
        detail: "expected Common Area harbor-view-stairwell, got Unit harbor-view-2a",
      },
    ]);
    expect(formatScorecard(scorecard)).toContain(
      "common-area-new-report › location: expected Common Area harbor-view-stairwell, got Unit harbor-view-2a",
    );
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
