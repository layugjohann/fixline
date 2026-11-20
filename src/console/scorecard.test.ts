import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIMENSIONS, type Grade } from "@/evals/graders";
import { loadEvalRuns, loadEvalTrace } from "@/evals/eval-runs";
import { buildScorecard, type ScenarioResult } from "@/evals/scorecard";
import type { Trace } from "@/domain";
import { formatRatio, latestRunPerModel, scorecardPageData, ScorecardFileSchema, type EvalRunFiles } from "./scorecard";

const allPass = (): Grade[] => DIMENSIONS.map((dimension) => ({ dimension, status: "pass", detail: "ok" }));

function result(scenarioId: string, status: ScenarioResult["status"], grades: Grade[] = []): ScenarioResult {
  return { scenarioId, description: `The ${scenarioId} scenario`, tags: [], status, grades };
}

const burstPipe = result("emergency-burst-pipe", "pass", allPass());
const rentQuestion = result(
  "not-maintenance-rent-question",
  "fail",
  allPass().map((grade) =>
    grade.dimension === "classification" ? { ...grade, status: "fail", detail: "expected not-maintenance" } : grade,
  ),
);

/** A scorecard.json exactly as the eval runner writes it, round-tripped through JSON. */
function scorecardFile(model: string, startedAt: string, results: ScenarioResult[], judge?: string) {
  const scorecard = buildScorecard({ model, startedAt, results, ...(judge ? { judge } : {}) });
  return ScorecardFileSchema.parse(JSON.parse(JSON.stringify(scorecard)));
}

const trace: Trace = { messageId: "msg-burst-pipe", steps: [{ type: "model-turn", text: "Looking up the Sender." }] };

describe("Scorecard page data", () => {
  const groqOld: EvalRunFiles = {
    runId: "groq-old",
    scorecard: scorecardFile("groq:openai/gpt-oss-120b", "2026-11-01T10:00:00Z", [result("emergency-burst-pipe", "fail", allPass())]),
    traceIds: [],
  };
  const groq: EvalRunFiles = {
    runId: "groq",
    scorecard: scorecardFile("groq:openai/gpt-oss-120b", "2026-11-18T10:00:00Z", [burstPipe, rentQuestion], "groq:openai/gpt-oss-20b"),
    traceIds: ["emergency-burst-pipe", "not-maintenance-rent-question"],
  };
  // A partial run: one scenario hit the rate limit, and the other wasn't in the run at all.
  const qwen: EvalRunFiles = {
    runId: "qwen",
    scorecard: scorecardFile("groq:qwen/qwen3.8-27b", "2026-11-18T11:00:00Z", [result("emergency-burst-pipe", "not-run")]),
    traceIds: ["emergency-burst-pipe"],
  };

  it("compares the latest run per model on the README's dimensions, with n/N counts", () => {
    const page = scorecardPageData([qwen, groqOld, groq]);
    expect(page.models.map((model) => [model.model, model.runId])).toEqual([
      ["groq:openai/gpt-oss-120b", "groq"],
      ["groq:qwen/qwen3.8-27b", "qwen"],
    ]);
    expect(page.dimensions.map((d) => d.dimension)).toEqual([...DIMENSIONS]);
    expect(page.dimensions[0]?.label).toBe("Classification (maintenance or not)");

    const [gptOss, qwenModel] = page.models;
    expect(gptOss).toMatchObject({
      startedAt: "2026-11-18T10:00:00Z",
      judge: "groq:openai/gpt-oss-20b",
      scenarioCount: 2,
      scenariosPassed: { passed: 1, graded: 2, score: 0.5 },
      notGraded: 0,
    });
    expect(gptOss?.dimensions[0]).toEqual({ passed: 1, graded: 2, score: 0.5 });
    expect(formatRatio(gptOss!.scenariosPassed)).toBe("50% · 1/2");

    // Nothing graded is "not graded", not 0%.
    expect(qwenModel?.scenariosPassed).toEqual({ passed: 0, graded: 0, score: null });
    expect(qwenModel?.notGraded).toBe(1);
    expect(formatRatio(qwenModel!.dimensions[0]!)).toBe("Not graded");
  });

  it("builds a per-scenario grid, with not-graded cells for rate-limited and missing scenarios", () => {
    const page = scorecardPageData([groq, qwen]);
    expect(page.scenarios.map((row) => row.scenarioId)).toEqual(["emergency-burst-pipe", "not-maintenance-rent-question"]);

    const [pipe, rent] = page.scenarios;
    expect(pipe?.description).toBe("The emergency-burst-pipe scenario");
    expect(pipe?.cells[0]).toMatchObject({
      status: "pass",
      trace: { runId: "groq", scenarioId: "emergency-burst-pipe" },
    });
    expect(pipe?.cells[0]?.dimensions.every((status) => status === "pass")).toBe(true);
    expect(pipe?.cells[1]).toMatchObject({ status: "not-graded", trace: { runId: "qwen", scenarioId: "emergency-burst-pipe" } });
    expect(pipe?.cells[1]?.dimensions.every((status) => status === "not-graded")).toBe(true);

    expect(rent?.cells[0]?.status).toBe("fail");
    expect(rent?.cells[0]?.dimensions[0]).toBe("fail");
    expect(rent?.cells[0]?.detail).toContain("expected not-maintenance");
    expect(rent?.cells[1]).toMatchObject({ status: "not-graded" });
    expect(rent?.cells[1]?.trace).toBeUndefined();
  });

  it("keeps a single newest run per model", () => {
    expect(latestRunPerModel([groq, groqOld]).map((run) => run.runId)).toEqual(["groq"]);
  });

  it("is empty when there are no eval runs", () => {
    expect(scorecardPageData([])).toMatchObject({ models: [], scenarios: [] });
  });
});

describe("eval run files", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads each run's scorecard.json and traces into the page's data", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fixline-eval-runs-"));
    await mkdir(path.join(dir, "groq", "traces"), { recursive: true });
    await writeFile(
      path.join(dir, "groq", "scorecard.json"),
      JSON.stringify(buildScorecard({ model: "groq", startedAt: "2026-11-18T10:00:00Z", results: [burstPipe] })),
    );
    await writeFile(path.join(dir, "groq", "traces", "emergency-burst-pipe.json"), JSON.stringify(trace));
    await mkdir(path.join(dir, "not-a-run"));

    const runs = await loadEvalRuns(dir);
    expect(runs.map((run) => [run.runId, run.traceIds])).toEqual([["groq", ["emergency-burst-pipe"]]]);
    expect(scorecardPageData(runs).scenarios[0]?.cells[0]?.trace).toEqual({ runId: "groq", scenarioId: "emergency-burst-pipe" });

    expect(await loadEvalTrace("groq", "emergency-burst-pipe", dir)).toEqual(trace);
    expect(await loadEvalTrace("groq", "missing", dir)).toBeUndefined();
    expect(await loadEvalTrace("..", "emergency-burst-pipe", dir)).toBeUndefined();
  });

  it("names the file when a scorecard doesn't parse", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fixline-eval-runs-"));
    await mkdir(path.join(dir, "broken"));
    await writeFile(path.join(dir, "broken", "scorecard.json"), JSON.stringify({ model: "groq" }));
    await expect(loadEvalRuns(dir)).rejects.toThrow(/broken.*not a valid scorecard/);
  });

  it("has no runs when the directory doesn't exist", async () => {
    expect(await loadEvalRuns(path.join(tmpdir(), "fixline-no-such-dir"))).toEqual([]);
  });
});
