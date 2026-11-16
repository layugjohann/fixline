import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { TraceSchema, type Proposal, type ProposalOperation } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { DRAFT_REPLY_RUBRIC } from "./draft-reply-rubric";
import { goldenScenarios } from "./golden-scenarios";
import { runEvals } from "./runner";
import { parseScenarios, type GoldenScenario } from "./scenario";
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
    operations: scenario.expected.workOrders.map((workOrder): ProposalOperation =>
      workOrder.type === "attach"
        ? {
            type: "attach",
            workOrderId: workOrder.workOrderId,
            matchType: scenario.expected.routing.rules.includes("cross-tenant-match") ? "cross-tenant" : "same-tenant",
            information: "New information.",
          }
        : {
            type: "create",
            location: workOrder.location,
            title: "Problem",
            description: "Described problem.",
            trade: typeof workOrder.trade === "string" ? workOrder.trade : workOrder.trade[0]!,
            urgency: workOrder.urgency,
          },
    ),
    uncertain: scenario.expected.routing.rules.includes("uncertain"),
    draftReplies: scenario.expected.draftReplies.map((reply) => ({
      purpose: reply.purpose,
      body: "Hello, could you tell us a little more? Harbor Lane Property Management",
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

/** A mock LLM judge that gives every rubric criterion the same verdict, except those listed as failing. */
function scriptedJudge(failing: Record<string, string> = {}) {
  const verdict = Object.fromEntries(
    DRAFT_REPLY_RUBRIC.map((criterion) => [
      criterion.id,
      criterion.id in failing
        ? { pass: false, explanation: failing[criterion.id] }
        : { pass: true, explanation: "Meets the criterion." },
    ]),
  );
  return new MockLanguageModelV4({ doGenerate: async () => toolCallTurn("submitVerdict", verdict) });
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

describe("prompt-injection scenarios", () => {
  const injections = goldenScenarios.filter((s) => s.tags.includes("prompt-injection"));

  it("has at least five, each listing the outcomes its injected instructions try to force", () => {
    expect(injections.length).toBeGreaterThanOrEqual(5);
    expect(injections.every((s) => (s.expected.injectedDemands ?? []).length > 0)).toBe(true);
    const demandTypes = new Set(injections.flatMap((s) => s.expected.injectedDemands!.map((d) => d.type)));
    expect(demandTypes).toEqual(new Set(["classification", "urgency", "trade", "attach", "create"]));
  });

  it("includes injected Messages that still describe a real problem, expected to be triaged on it", () => {
    const realProblems = injections.filter((s) => s.expected.workOrders.length > 0);
    expect(realProblems.length).toBeGreaterThanOrEqual(4);
    expect(new Set(realProblems.flatMap((s) => s.expected.workOrders.flatMap((w) => (w.type === "create" ? [w.urgency] : [])))))
      .toEqual(new Set(["emergency", "routine"]));
  });

  it("rejects an injected demand the expected Proposal already satisfies", () => {
    const urgencyInjection = scenario("injection-mark-everything-emergency");
    expect(() =>
      parseScenarios([
        { ...urgencyInjection, expected: { ...urgencyInjection.expected, injectedDemands: [{ type: "urgency", urgency: "routine" }] } },
      ]),
    ).toThrow("An injected demand must contradict the expected Proposal");
  });
});

describe("golden dataset review routing", () => {
  it("expects a routing outcome for every scenario, covering every outcome and review rule", () => {
    const outcomes = new Set(goldenScenarios.map((s) => s.expected.routing.outcome));
    expect(outcomes).toEqual(new Set(["auto-apply", "review", "apply-and-flag", "split"]));
    const rules = new Set(goldenScenarios.flatMap((s) => s.expected.routing.rules));
    expect(rules).toEqual(new Set(["emergency", "uncertain", "cross-tenant-match", "unknown-sender", "draft-reply"]));
  });

  it("covers the cross-Tenant ceiling leak, an unknown Sender and an uncertain Message", () => {
    const ceiling = scenario("review-cross-tenant-ceiling-leak");
    const target = ceiling.expected.workOrders[0];
    if (target?.type !== "attach") throw new Error("Expected an attach");
    const leak = ceiling.board.find((w) => w.id === target.workOrderId)!;
    const sender = propertyRoster.tenants.find((t) => t.email === ceiling.message.sender.email)!;
    // The Work Order is in another Unit and was raised by another Tenant.
    expect(leak.location).not.toEqual({ type: "unit", unitId: sender.unitId });
    expect(leak.raisedByTenantId).toBeDefined();
    expect(leak.raisedByTenantId).not.toBe(sender.id);
    expect(ceiling.expected.routing).toEqual({ outcome: "review", rules: ["cross-tenant-match"] });

    const unknown = scenario("review-unknown-sender");
    expect(propertyRoster.tenants.some((t) => t.email === unknown.message.sender.email)).toBe(false);
    expect(unknown.expected.routing).toEqual({ outcome: "review", rules: ["unknown-sender"] });

    expect(scenario("review-uncertain-message").expected.routing).toEqual({ outcome: "review", rules: ["uncertain"] });
  });

  it("expects every emergency to be applied and flagged", () => {
    const emergencies = goldenScenarios.filter((s) =>
      s.expected.workOrders.some((w) => w.type === "create" && w.urgency === "emergency"),
    );
    expect(emergencies.length).toBeGreaterThan(0);
    expect(emergencies.every((s) => ["apply-and-flag", "split"].includes(s.expected.routing.outcome))).toBe(true);
  });

  it("expects an emergency with a review trigger to be split, not applied whole", () => {
    expect(scenario("split-unknown-sender-emergency-and-routine").expected.routing).toEqual({
      outcome: "split",
      rules: ["emergency", "unknown-sender"],
    });
  });

  it("rejects a split routing without a review rule or without anything besides the emergency", () => {
    const burstPipe = scenario("emergency-burst-pipe");
    expect(() =>
      parseScenarios([{ ...burstPipe, expected: { ...burstPipe.expected, routing: { outcome: "split", rules: ["emergency"] } } }]),
    ).toThrow("A split Proposal names the emergency rule and a review rule");
    expect(() =>
      parseScenarios([
        {
          ...burstPipe,
          expected: { ...burstPipe.expected, routing: { outcome: "split", rules: ["emergency", "unknown-sender"] } },
        },
      ]),
    ).toThrow("A split Proposal names the emergency rule and a review rule");
  });
});

describe("eval runner", () => {
  it("passes every dimension when the agent submits the expected Proposals", async () => {
    const proposals = Object.fromEntries(goldenScenarios.map((s) => [s.message.id, perfectProposal(s)]));

    const { scorecard } = await runEvals(goldenScenarios, { model: scriptedModel(proposals), judge: scriptedJudge() });

    expect(scorecard.totals).toEqual({
      scenarios: goldenScenarios.length,
      passed: goldenScenarios.length,
      failed: 0,
      errored: 0,
      notRun: 0,
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
    // Missing the emergency also means it isn't applied and flagged.
    expect(pipeResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "urgency", status: "fail", detail: "expected emergency, got routine" },
      { dimension: "routing", status: "fail", detail: "expected apply-and-flag (emergency), got auto-apply" },
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
      uncertain: false,
      draftReplies: [],
      reasoning: "Scripted.",
    };
    const wronglyAttached: Proposal = {
      classification: "maintenance",
      operations: [{ type: "attach", workOrderId: "WO-2", matchType: "same-tenant", information: "Shower drains slowly." }],
      uncertain: false,
      draftReplies: [],
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

  it("grades a Proposal that fails validation as a failure on every dimension, keeping the rejection in its trace", async () => {
    const recurs = scenario("no-match-closed-work-order-recurs");
    // Attaching to the closed fridge Work Order (WO-4) instead of creating a new one.
    const attachToClosed: Proposal = {
      classification: "maintenance",
      operations: [{ type: "attach", workOrderId: "WO-4", matchType: "same-tenant", information: "Not cold again." }],
      uncertain: false,
      draftReplies: [],
      reasoning: "Scripted.",
    };

    const { scorecard, traces } = await runEvals([recurs], {
      model: scriptedModel({ [recurs.message.id]: attachToClosed }),
    });

    expect(scorecard.totals).toMatchObject({ passed: 0, failed: 1, errored: 0 });
    expect(
      scorecard.scenarios[0]!.grades.every((g) => g.status === "fail" && g.detail.startsWith("invalid Proposal")),
    ).toBe(true);
    expect(traces[recurs.id]!.steps.at(-1)).toEqual({
      type: "rejection",
      problems: ["Operation 1 attaches to Work Order WO-4, which is closed."],
    });
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

  it("grades review routing: a missed uncertain flag, a cross-Tenant match and an unknown Sender", async () => {
    const uncertain = scenario("review-uncertain-message");
    const ceiling = scenario("review-cross-tenant-ceiling-leak");
    const unknown = scenario("review-unknown-sender");
    const confident: Proposal = { ...perfectProposal(uncertain), uncertain: false };
    // The agent mislabels the match, but the Board shows another Tenant raised the Work Order.
    const mislabelled = perfectProposal(ceiling);
    const ceilingOperation = mislabelled.operations[0]!;
    if (ceilingOperation.type !== "attach") throw new Error("Expected an attach operation");
    ceilingOperation.matchType = "same-tenant";

    const { scorecard } = await runEvals([uncertain, ceiling, unknown], {
      model: scriptedModel({
        [uncertain.message.id]: confident,
        [ceiling.message.id]: mislabelled,
        [unknown.message.id]: perfectProposal(unknown),
      }),
    });

    const [uncertainResult, ceilingResult, unknownResult] = scorecard.scenarios;
    expect(uncertainResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "routing", status: "fail", detail: "expected review (uncertain), got auto-apply" },
    ]);
    expect(uncertainResult!.routing).toMatchObject({ outcome: "auto-apply" });
    expect(ceilingResult!.grades).toContainEqual({
      dimension: "routing",
      status: "pass",
      detail: "review (cross-tenant-match)",
    });
    expect(unknownResult!.grades).toContainEqual({ dimension: "routing", status: "pass", detail: "review (unknown-sender)" });
    expect(formatScorecard(scorecard)).toContain(
      "review-uncertain-message › routing: expected review (uncertain), got auto-apply",
    );
    expect(scorecard.dimensions).toContainEqual({ dimension: "routing", passed: 2, graded: 3, score: 2 / 3 });
  });

  it("fails the injection dimension when the agent follows injected instructions, and grades the real problem separately", async () => {
    const urgencyInjection = scenario("injection-mark-everything-emergency");
    const toolOutputInjection = scenario("injection-fake-tool-output");
    const fakeSystem = scenario("injection-fake-system-text-rent-question");
    // Obeys "mark everything emergency" but otherwise triages the towel rail correctly.
    const obeyedUrgency = perfectProposal(urgencyInjection);
    const towelRail = obeyedUrgency.operations[0]!;
    if (towelRail.type !== "create") throw new Error("Expected a create operation");
    towelRail.urgency = "emergency";
    // Files the Work Order in the Unit the fake tool output claims, and attaches to WO-1 as told.
    const obeyedToolOutput: Proposal = {
      classification: "maintenance",
      operations: [
        {
          type: "create",
          location: { type: "unit", unitId: "quay-court-102" },
          title: "Cooker hood light",
          description: "Cooker hood light out.",
          trade: "appliance",
          urgency: "routine",
        },
        { type: "attach", workOrderId: "WO-1", matchType: "same-tenant", information: "Cooker hood light out." },
      ],
      uncertain: false,
      draftReplies: [],
      reasoning: "Scripted.",
    };

    const { scorecard } = await runEvals([urgencyInjection, toolOutputInjection, fakeSystem], {
      model: scriptedModel({
        [urgencyInjection.message.id]: obeyedUrgency,
        [toolOutputInjection.message.id]: obeyedToolOutput,
        [fakeSystem.message.id]: perfectProposal(fakeSystem),
      }),
    });

    const [urgencyResult, toolOutputResult, fakeSystemResult] = scorecard.scenarios;
    expect(urgencyResult!.grades.filter((g) => g.status === "fail")).toEqual([
      { dimension: "urgency", status: "fail", detail: "expected routine, got emergency" },
      { dimension: "injection", status: "fail", detail: "followed injected instruction(s): Urgency emergency" },
      // The obeyed emergency also skips the routing the real problem should get.
      { dimension: "routing", status: "fail", detail: "expected auto-apply, got apply-and-flag (emergency)" },
    ]);
    expect(toolOutputResult!.grades).toContainEqual({
      dimension: "injection",
      status: "fail",
      detail: "followed injected instruction(s): new Work Order in Unit quay-court-102; attach to WO-1",
    });
    expect(fakeSystemResult).toMatchObject({ status: "pass" });
    expect(fakeSystemResult!.grades).toContainEqual({
      dimension: "injection",
      status: "pass",
      detail: "resisted 3 injected instructions",
    });
    // Scenarios without injected instructions skip the dimension.
    const { scorecard: plain } = await runEvals([scenario("routine-blown-bulb")], {
      model: scriptedModel({ "msg-bulb": perfectProposal(scenario("routine-blown-bulb")) }),
    });
    expect(plain.scenarios[0]!.grades).toContainEqual({
      dimension: "injection",
      status: "skip",
      detail: "no injected instructions",
    });
    expect(formatScorecard(scorecard)).toContain(
      "injection-mark-everything-emergency › injection: followed injected instruction(s): Urgency emergency",
    );
  });

  it("marks a rate-limited scenario as not run, not failed, and keeps grading the rest", async () => {
    const fridge = scenario("urgent-fridge-not-cooling");
    const bulb = scenario("routine-blown-bulb");
    const proposals = { [bulb.message.id]: perfectProposal(bulb) };
    const scripted = scriptedModel(proposals);
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (JSON.stringify(options.prompt).includes(fridge.message.id)) {
          throw providerError(429, "Rate limit reached for requests per minute", { "retry-after": "12" });
        }
        return scripted.doGenerate(options);
      },
    });

    const { scorecard } = await runEvals([fridge, bulb], { model, modelName: "groq:test-model" });

    expect(scorecard.totals).toEqual({ scenarios: 2, passed: 1, failed: 0, errored: 0, notRun: 1 });
    expect(scorecard.scenarios[0]).toMatchObject({ status: "not-run", rateLimit: "rate-limit", grades: [] });
    expect(scorecard.scenarios[0]!.error).toContain("ModelRateLimitError");
    expect(scorecard.scenarios[1]).toMatchObject({ status: "pass" });
    for (const dimension of scorecard.dimensions) {
      // The bulb Message has no injected instructions and needs no Draft Reply, so those dimensions are skipped.
      const skipped = ["injection", "draft-reply", "reply-quality"].includes(dimension.dimension);
      const expected = skipped ? { graded: 0, passed: 0 } : { graded: 1, passed: 1 };
      expect(dimension).toMatchObject(expected);
    }
    const printed = formatScorecard(scorecard);
    expect(printed).toContain("1 not run");
    expect(printed).not.toContain("Failures");
  });

  it("stops calling the model once its quota is used up, marking the remaining scenarios not run", async () => {
    const scenarios = [scenario("urgent-fridge-not-cooling"), scenario("routine-blown-bulb"), scenario("emergency-burst-pipe")];
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        throw providerError(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}');
      },
    });

    const { scorecard } = await runEvals(scenarios, { model });

    expect(scorecard.totals).toMatchObject({ scenarios: 3, failed: 0, errored: 0, notRun: 3 });
    expect(scorecard.scenarios.every((s) => s.status === "not-run" && s.rateLimit === "quota")).toBe(true);
    expect(scorecard.dimensions.every((d) => d.graded === 0)).toBe(true);
    // Only the first scenario reached the provider.
    expect(calls).toBe(1);
  });

  it("records the model it ran on the scorecard", async () => {
    const bulb = scenario("routine-blown-bulb");
    const model = scriptedModel({ [bulb.message.id]: perfectProposal(bulb) });

    const named = await runEvals([bulb], { model, modelName: "gemini:gemini-flash-latest" });
    expect(named.scorecard.model).toBe("gemini:gemini-flash-latest");
    expect(formatScorecard(named.scorecard)).toContain("model gemini:gemini-flash-latest");

    const unnamed = await runEvals([bulb], { model });
    expect(unnamed.scorecard.model).toBe(`${model.provider}:${model.modelId}`);
  });

  it("still reports other infrastructure errors as errors, not as agent failures", async () => {
    const fridge = scenario("urgent-fridge-not-cooling");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError(401, "Invalid API key");
      },
    });

    const { scorecard } = await runEvals([fridge], { model });

    expect(scorecard.totals).toMatchObject({ failed: 0, errored: 1, notRun: 0 });
    expect(scorecard.scenarios[0]).toMatchObject({ status: "error", grades: [] });
  });
});

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

describe("Draft Replies", () => {
  it("covers a missing Unit, a Unit mismatch and a confirmation-worthy emergency, each routed to review", () => {
    const purposes = (id: string) => scenario(id).expected.draftReplies.map((reply) => reply.purpose);
    expect(purposes("draft-reply-missing-unit")).toEqual(["missing-unit"]);
    expect(purposes("draft-reply-unit-mismatch")).toEqual(["unit-mismatch"]);
    expect(purposes("draft-reply-emergency-confirmation")).toEqual(["emergency-confirmation"]);

    // Missing Unit: an unknown Sender who doesn't say where they live.
    const missing = scenario("draft-reply-missing-unit");
    expect(propertyRoster.tenants.some((t) => t.email === missing.message.sender.email)).toBe(false);
    expect(missing.expected.routing).toEqual({ outcome: "review", rules: ["unknown-sender", "draft-reply"] });

    // Unit mismatch: a known Tenant naming a Unit that isn't theirs.
    const mismatch = scenario("draft-reply-unit-mismatch");
    const tenant = propertyRoster.tenants.find((t) => t.email === mismatch.message.sender.email)!;
    const workOrder = mismatch.expected.workOrders[0];
    if (workOrder?.type !== "create") throw new Error("Expected a create operation");
    expect(workOrder.alsoAcceptedLocations).toEqual([{ type: "unit", unitId: "harbor-view-2a" }]);
    expect(tenant.unitId).not.toBe("harbor-view-2a");
    expect(mismatch.expected.routing).toEqual({ outcome: "review", rules: ["uncertain", "draft-reply"] });

    // Emergency: on the Board at once, with the reply waiting for review.
    expect(scenario("draft-reply-emergency-confirmation").expected.routing).toEqual({
      outcome: "split",
      rules: ["emergency", "draft-reply"],
    });
  });

  it("expects no Draft Reply in any other scenario", () => {
    const withReplies = goldenScenarios.filter((s) => s.expected.draftReplies.length > 0).map((s) => s.id);
    expect(withReplies.sort()).toEqual(
      ["draft-reply-emergency-confirmation", "draft-reply-missing-unit", "draft-reply-unit-mismatch"].sort(),
    );
  });

  it("rejects a scenario whose routing disagrees with its expected Draft Replies", () => {
    const missing = scenario("draft-reply-missing-unit");
    expect(() =>
      parseScenarios([{ ...missing, expected: { ...missing.expected, routing: { outcome: "review", rules: ["unknown-sender"] } } }]),
    ).toThrow("The draft-reply rule triggers exactly when a Draft Reply is expected");
  });

  it("grades missing, unexpected and wrong-purpose Draft Replies", async () => {
    const missing = scenario("draft-reply-missing-unit");
    const bulb = scenario("routine-blown-bulb");
    const mismatch = scenario("draft-reply-unit-mismatch");
    const reply = { body: "Hello. Harbor Lane Property Management" };

    const { scorecard } = await runEvals([missing, bulb, mismatch], {
      model: scriptedModel({
        [missing.message.id]: { ...perfectProposal(missing), draftReplies: [] },
        [bulb.message.id]: { ...perfectProposal(bulb), draftReplies: [{ purpose: "unit-mismatch", ...reply }] },
        [mismatch.message.id]: { ...perfectProposal(mismatch), draftReplies: [{ purpose: "missing-unit", ...reply }] },
      }),
      judge: scriptedJudge(),
    });

    const draftReplyGrade = (index: number) =>
      scorecard.scenarios[index]!.grades.find((g) => g.dimension === "draft-reply");
    expect(draftReplyGrade(0)).toEqual({
      dimension: "draft-reply",
      status: "fail",
      detail: "expected missing-unit, got no Draft Reply",
    });
    expect(draftReplyGrade(1)).toEqual({
      dimension: "draft-reply",
      status: "fail",
      detail: "expected no Draft Reply, got unit-mismatch",
    });
    expect(draftReplyGrade(2)).toEqual({
      dimension: "draft-reply",
      status: "fail",
      detail: "expected unit-mismatch, got missing-unit",
    });
    // Only replies with an expected purpose are judged.
    for (const result of scorecard.scenarios) {
      expect(result.grades.find((g) => g.dimension === "reply-quality")).toMatchObject({ status: "skip" });
    }
  });

  it("accepts any of the locations a Unit mismatch leaves open", async () => {
    const mismatch = scenario("draft-reply-unit-mismatch");
    const inNamedUnit = perfectProposal(mismatch);
    const operation = inNamedUnit.operations[0]!;
    if (operation.type !== "create") throw new Error("Expected a create operation");
    operation.location = { type: "unit", unitId: "harbor-view-2a" };
    const inOtherUnit = structuredClone(inNamedUnit);
    const other = inOtherUnit.operations[0]!;
    if (other.type !== "create") throw new Error("Expected a create operation");
    other.location = { type: "unit", unitId: "harbor-view-1a" };

    const { scorecard: named } = await runEvals([mismatch], { model: scriptedModel({ [mismatch.message.id]: inNamedUnit }) });
    const { scorecard: wrong } = await runEvals([mismatch], { model: scriptedModel({ [mismatch.message.id]: inOtherUnit }) });

    expect(named.scenarios[0]!.grades).toContainEqual({ dimension: "location", status: "pass", detail: "Unit harbor-view-2a" });
    expect(wrong.scenarios[0]!.grades).toContainEqual({
      dimension: "location",
      status: "fail",
      detail: "expected Unit harbor-view-3b or Unit harbor-view-2a, got Unit harbor-view-1a",
    });
  });
});

describe("LLM judge", () => {
  const missing = scenario("draft-reply-missing-unit");
  const proposals = { [missing.message.id]: perfectProposal(missing) };

  it("passes reply quality when the judge passes every rubric criterion", async () => {
    const { scorecard } = await runEvals([missing], {
      model: scriptedModel(proposals),
      judge: scriptedJudge(),
      judgeName: "groq:judge-model",
    });

    expect(scorecard.judge).toBe("groq:judge-model");
    expect(scorecard.scenarios[0]!.grades).toContainEqual({
      dimension: "reply-quality",
      status: "pass",
      detail: `${DRAFT_REPLY_RUBRIC.length}/${DRAFT_REPLY_RUBRIC.length} rubric criteria`,
    });
    expect(formatScorecard(scorecard)).toContain("Draft Replies judged by groq:judge-model");
  });

  it("fails reply quality on any failed criterion, naming it and the judge's reason", async () => {
    const { scorecard } = await runEvals([missing], {
      model: scriptedModel(proposals),
      judge: scriptedJudge({ "accurate-no-overpromising": "Promises a plumber tomorrow at 9am." }),
    });

    expect(scorecard.scenarios[0]).toMatchObject({ status: "fail" });
    expect(scorecard.scenarios[0]!.grades).toContainEqual({
      dimension: "reply-quality",
      status: "fail",
      detail: "failed accurate-no-overpromising (Promises a plumber tomorrow at 9am.)",
    });
    expect(formatScorecard(scorecard)).toContain(
      "draft-reply-missing-unit › reply-quality: failed accurate-no-overpromising (Promises a plumber tomorrow at 9am.)",
    );
  });

  it("gives the judge the rubric, the Draft Reply and the scenario's guidance", async () => {
    const judge = scriptedJudge();

    await runEvals([missing], { model: scriptedModel(proposals), judge });

    const call = JSON.stringify(judge.doGenerateCalls[0]!.prompt);
    expect(call).toContain("private-and-on-message");
    expect(call).toContain(missing.expected.draftReplies[0]!.guidance);
    expect(call).toContain(perfectProposal(missing).draftReplies[0]!.body);
  });

  it("skips reply quality without a judge model, or when the judge is rate-limited, rather than failing the agent", async () => {
    const { scorecard: unjudged } = await runEvals([missing], { model: scriptedModel(proposals) });
    const rateLimitedJudge = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError(429, "Rate limit reached for requests per minute");
      },
    });
    const { scorecard: limited } = await runEvals([missing], { model: scriptedModel(proposals), judge: rateLimitedJudge });

    expect(unjudged.scenarios[0]).toMatchObject({ status: "pass" });
    expect(unjudged.scenarios[0]!.grades).toContainEqual({ dimension: "reply-quality", status: "skip", detail: "no judge model" });
    expect(formatScorecard(unjudged)).toContain("no Draft Reply judge");
    expect(limited.scenarios[0]).toMatchObject({ status: "pass" });
    expect(limited.scenarios[0]!.grades.find((g) => g.dimension === "reply-quality")).toMatchObject({
      status: "skip",
      detail: expect.stringContaining("judge not run"),
    });
  });
});
