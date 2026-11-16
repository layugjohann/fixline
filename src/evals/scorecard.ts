import type { Proposal } from "@/domain";
import type { RateLimitKind } from "@/models";
import { DIMENSIONS, type Dimension, type Grade } from "./graders";

/**
 * How one scenario went. "not-run" means the model provider's rate limit or quota stopped it, and
 * "error" means it broke for another non-agent reason. Neither is graded or counted as a failure.
 */
export interface ScenarioResult {
  scenarioId: string;
  description: string;
  tags: string[];
  status: "pass" | "fail" | "error" | "not-run";
  /** Why a "not-run" scenario didn't run. */
  rateLimit?: RateLimitKind;
  grades: Grade[];
  proposal?: Proposal;
  error?: string;
}

export interface DimensionScore {
  dimension: Dimension;
  passed: number;
  graded: number;
  /** passed / graded, or null when no scenario graded this dimension. */
  score: number | null;
}

/** The machine-readable result of one eval run. */
export interface Scorecard {
  model: string;
  startedAt: string;
  totals: { scenarios: number; passed: number; failed: number; errored: number; notRun: number };
  dimensions: DimensionScore[];
  scenarios: ScenarioResult[];
}

export function buildScorecard(input: {
  model: string;
  startedAt: string;
  results: ScenarioResult[];
}): Scorecard {
  const { results } = input;
  const dimensions = DIMENSIONS.map((dimension): DimensionScore => {
    const grades = results.flatMap((result) => result.grades).filter((grade) => grade.dimension === dimension);
    const graded = grades.filter((grade) => grade.status !== "skip").length;
    const passed = grades.filter((grade) => grade.status === "pass").length;
    return { dimension, passed, graded, score: graded === 0 ? null : passed / graded };
  });
  return {
    model: input.model,
    startedAt: input.startedAt,
    totals: {
      scenarios: results.length,
      passed: results.filter((result) => result.status === "pass").length,
      failed: results.filter((result) => result.status === "fail").length,
      errored: results.filter((result) => result.status === "error").length,
      notRun: results.filter((result) => result.status === "not-run").length,
    },
    dimensions,
    scenarios: results,
  };
}

const MARK = { pass: "✓", fail: "✗", skip: "–" } as const;

/** A plain-text scorecard for the terminal: per dimension, per scenario, then every failure with its reason. */
export function formatScorecard(scorecard: Scorecard): string {
  const lines: string[] = [];
  const { totals } = scorecard;
  lines.push(`Eval scorecard — model ${scorecard.model}`);
  lines.push(
    `${totals.passed}/${totals.scenarios} scenarios passed` +
      (totals.failed ? `, ${totals.failed} failed` : "") +
      (totals.errored ? `, ${totals.errored} errored (not graded)` : "") +
      (totals.notRun ? `, ${totals.notRun} not run (rate-limited, not graded)` : ""),
  );

  lines.push("", "By dimension");
  const dimensionWidth = Math.max(...DIMENSIONS.map((d) => d.length));
  for (const score of scorecard.dimensions) {
    const percent = score.score === null ? "n/a" : `${Math.round(score.score * 100)}%`;
    lines.push(`  ${score.dimension.padEnd(dimensionWidth)}  ${`${score.passed}/${score.graded}`.padStart(5)}  ${percent}`);
  }

  lines.push("", "By scenario");
  const idWidth = Math.max(8, ...scorecard.scenarios.map((s) => s.scenarioId.length));
  lines.push(`  ${"scenario".padEnd(idWidth)}  ${DIMENSIONS.map((d) => d.padEnd(d.length)).join("  ")}  result`);
  for (const result of scorecard.scenarios) {
    const cells = DIMENSIONS.map((dimension) => {
      const grade = result.grades.find((g) => g.dimension === dimension);
      const mark = grade ? MARK[grade.status] : "?";
      return mark.padEnd(dimension.length);
    });
    lines.push(`  ${result.scenarioId.padEnd(idWidth)}  ${cells.join("  ")}  ${result.status.toUpperCase()}`);
  }

  const problems = scorecard.scenarios.filter((result) => result.status === "fail" || result.status === "error");
  if (problems.length > 0) {
    lines.push("", "Failures");
    for (const result of problems) {
      if (result.status === "error") {
        lines.push(`  ${result.scenarioId}: ERROR ${result.error ?? ""}`.trimEnd());
        continue;
      }
      for (const grade of result.grades.filter((g) => g.status === "fail")) {
        lines.push(`  ${result.scenarioId} › ${grade.dimension}: ${grade.detail}`);
      }
    }
  }

  const notRun = scorecard.scenarios.filter((result) => result.status === "not-run");
  if (notRun.length > 0) {
    lines.push("", "Not run (model provider rate limit or quota; not an agent failure)");
    for (const result of notRun) {
      lines.push(`  ${result.scenarioId}: ${result.error ?? ""}`.trimEnd());
    }
  }
  return lines.join("\n");
}
