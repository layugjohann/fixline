/**
 * The data behind the console's Scorecard page, kept free of React and Node so it can be tested.
 *
 * The page is built from the committed eval runs (`eval-runs/<run>/scorecard.json`, plus the
 * traces next to each): the latest run per model side by side, then a per-scenario grid.
 * Scenarios a run didn't grade (a rate limit, another non-agent error, or a run that didn't
 * include them) show as not graded, never as failures.
 */
import { z } from "zod";
import { DIMENSIONS, type Dimension } from "@/evals/graders";
import { DIMENSION_LABELS, ScorecardSummarySchema } from "@/evals/scorecard";

/** One scenario's result in a saved scorecard.json: the parts the Scorecard page reads. */
const ScenarioResultSchema = z.object({
  scenarioId: z.string(),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  status: z.enum(["pass", "fail", "error", "not-run"]),
  grades: z
    .array(z.object({ dimension: z.enum(DIMENSIONS), status: z.enum(["pass", "fail", "skip"]), detail: z.string() }))
    .default([]),
  error: z.string().optional(),
});

/** A saved scorecard.json, as the eval runner writes it. */
export const ScorecardFileSchema = ScorecardSummarySchema.extend({
  scenarios: z.array(ScenarioResultSchema).default([]),
});
export type ScorecardFile = z.infer<typeof ScorecardFileSchema>;

/** One eval run directory: its name, its scorecard, and the scenarios it kept a trace for. */
export interface EvalRunFiles {
  /** The run's directory name under eval-runs/, such as `groq` or `2026-11-18T10-02-11-000Z`. */
  runId: string;
  scorecard: ScorecardFile;
  /** Scenario ids with a `traces/<scenarioId>.json` file. */
  traceIds: readonly string[];
}

/** n of N, where N counts only what was graded. `score` is null when nothing was. */
export interface Ratio {
  passed: number;
  graded: number;
  score: number | null;
}

/** One model's latest run, as a column of the comparison. */
export interface ScorecardModel {
  model: string;
  runId: string;
  startedAt: string;
  judge?: string;
  /** How many scenarios the run included. */
  scenarioCount: number;
  /** Scenarios passed out of those passed or failed. */
  scenariosPassed: Ratio;
  /** One per dimension, in DIMENSIONS order. */
  dimensions: Ratio[];
  /** Scenarios stopped by a rate limit or another non-agent error. */
  notGraded: number;
}

export type CellStatus = "pass" | "fail" | "not-graded";

/** One model's result on one scenario. */
export interface ScenarioCell {
  /** The overall result. */
  status: CellStatus;
  /** Each dimension's result, in DIMENSIONS order. A dimension that didn't apply is "skip". */
  dimensions: (CellStatus | "skip")[];
  /** Why the scenario wasn't graded, or what failed. */
  detail?: string;
  /** The eval run to open the scenario's trace from, when the run kept one. */
  trace?: { runId: string; scenarioId: string };
}

export interface ScenarioRow {
  scenarioId: string;
  description: string;
  /** One per model, in the same order as ScorecardPageData.models. */
  cells: ScenarioCell[];
}

export interface ScorecardPageData {
  dimensions: { dimension: Dimension; label: string }[];
  models: ScorecardModel[];
  scenarios: ScenarioRow[];
}

function ratio(passed: number, graded: number): Ratio {
  return { passed, graded, score: graded === 0 ? null : passed / graded };
}

/** The newest run for each model (by start time), sorted by model name. */
export function latestRunPerModel(runs: readonly EvalRunFiles[]): EvalRunFiles[] {
  const latest = new Map<string, EvalRunFiles>();
  for (const run of runs) {
    const current = latest.get(run.scorecard.model);
    const newer =
      !current ||
      run.scorecard.startedAt > current.scorecard.startedAt ||
      (run.scorecard.startedAt === current.scorecard.startedAt && run.runId > current.runId);
    if (newer) latest.set(run.scorecard.model, run);
  }
  return [...latest.values()].sort((a, b) => a.scorecard.model.localeCompare(b.scorecard.model));
}

function modelColumn(run: EvalRunFiles): ScorecardModel {
  const { scorecard } = run;
  const { totals } = scorecard;
  return {
    model: scorecard.model,
    runId: run.runId,
    startedAt: scorecard.startedAt,
    ...(scorecard.judge === undefined ? {} : { judge: scorecard.judge }),
    scenarioCount: totals.scenarios,
    scenariosPassed: ratio(totals.passed, totals.passed + totals.failed),
    dimensions: DIMENSIONS.map((dimension) => {
      const score = scorecard.dimensions.find((candidate) => candidate.dimension === dimension);
      return score ? ratio(score.passed, score.graded) : ratio(0, 0);
    }),
    notGraded: totals.notRun + totals.errored,
  };
}

const NOT_IN_RUN: Omit<ScenarioCell, "trace"> = {
  status: "not-graded",
  dimensions: DIMENSIONS.map(() => "not-graded"),
  detail: "Not in this model's latest run.",
};

function scenarioCell(run: EvalRunFiles, scenarioId: string): ScenarioCell {
  const result = run.scorecard.scenarios.find((candidate) => candidate.scenarioId === scenarioId);
  if (!result) return NOT_IN_RUN;
  const trace = run.traceIds.includes(scenarioId) ? { trace: { runId: run.runId, scenarioId } } : {};

  if (result.status === "error" || result.status === "not-run") {
    return {
      status: "not-graded",
      dimensions: DIMENSIONS.map(() => "not-graded"),
      detail:
        result.status === "not-run"
          ? "Not run: the model provider's rate limit or quota stopped it."
          : `Not graded: ${result.error ?? "the run broke for a reason that isn't the agent's"}.`,
      ...trace,
    };
  }

  const failures = result.grades.filter((grade) => grade.status === "fail");
  return {
    status: result.status,
    dimensions: DIMENSIONS.map((dimension) => {
      const grade = result.grades.find((candidate) => candidate.dimension === dimension);
      return grade ? grade.status : "not-graded";
    }),
    ...(failures.length > 0
      ? { detail: failures.map((grade) => `${DIMENSION_LABELS[grade.dimension]}: ${grade.detail}`).join("\n") }
      : {}),
    ...trace,
  };
}

/** Turn the committed eval runs into the Scorecard page's data. */
export function scorecardPageData(runs: readonly EvalRunFiles[]): ScorecardPageData {
  const latest = latestRunPerModel(runs);

  // Every scenario any latest run included, in the order the runs list them (golden order).
  const scenarios = new Map<string, string>();
  for (const run of latest) {
    for (const result of run.scorecard.scenarios) {
      if (!scenarios.has(result.scenarioId) || !scenarios.get(result.scenarioId)) {
        scenarios.set(result.scenarioId, result.description);
      }
    }
  }

  return {
    dimensions: DIMENSIONS.map((dimension) => ({ dimension, label: DIMENSION_LABELS[dimension] })),
    models: latest.map(modelColumn),
    scenarios: [...scenarios].map(([scenarioId, description]) => ({
      scenarioId,
      description,
      cells: latest.map((run) => scenarioCell(run, scenarioId)),
    })),
  };
}

/** "63% · 5/8", or "Not graded" when nothing was. */
export function formatRatio({ passed, graded, score }: Ratio): string {
  return score === null ? "Not graded" : `${Math.round(score * 100)}% · ${passed}/${graded}`;
}
