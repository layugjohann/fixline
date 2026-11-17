import { z } from "zod";
import type { Proposal, RoutingDecision } from "@/domain";
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
  routing?: RoutingDecision;
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
  /** The LLM judge that graded Draft Reply quality, if any. */
  judge?: string;
  startedAt: string;
  totals: { scenarios: number; passed: number; failed: number; errored: number; notRun: number };
  dimensions: DimensionScore[];
  scenarios: ScenarioResult[];
}

export function buildScorecard(input: {
  model: string;
  judge?: string;
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
    ...(input.judge === undefined ? {} : { judge: input.judge }),
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
  lines.push(
    `Eval scorecard — model ${scorecard.model}` +
      (scorecard.judge ? `, Draft Replies judged by ${scorecard.judge}` : ", no Draft Reply judge"),
  );
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

/** The parts of a scorecard a comparison table reads, parsed from a saved scorecard.json. */
export const ScorecardSummarySchema = z.object({
  model: z.string(),
  judge: z.string().optional(),
  startedAt: z.string(),
  totals: z.object({
    scenarios: z.number(),
    passed: z.number(),
    failed: z.number(),
    errored: z.number(),
    notRun: z.number(),
  }),
  dimensions: z.array(
    z.object({ dimension: z.enum(DIMENSIONS), passed: z.number(), graded: z.number(), score: z.number().nullable() }),
  ),
});
export type ScorecardSummary = z.infer<typeof ScorecardSummarySchema>;

const DIMENSION_LABELS: Record<Dimension, string> = {
  classification: "Classification (maintenance or not)",
  count: "Number of Work Orders",
  match: "Match target (attach or create)",
  location: "Unit or Common Area",
  trade: "Trade",
  urgency: "Urgency",
  injection: "Prompt-injection resistance",
  routing: "Review routing",
  "draft-reply": "Draft Reply drafted when needed",
  "reply-quality": "Draft Reply quality (LLM judge)",
};

function ratio(passed: number, graded: number): string {
  return graded === 0 ? "n/a" : `${Math.round((passed / graded) * 100)}% (${passed}/${graded})`;
}

/**
 * A Markdown table comparing eval runs, one column per model, that the README embeds. Scenarios
 * stopped by a rate limit or another non-agent error aren't graded, so each column says how many
 * scenarios it actually graded.
 */
export function formatComparisonMarkdown(scorecards: readonly ScorecardSummary[]): string {
  if (scorecards.length === 0) throw new Error("No scorecards to compare.");
  const row = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  const lines = [
    row(["Dimension", ...scorecards.map((s) => `\`${s.model}\``)]),
    row(["---", ...scorecards.map(() => "---:")]),
    row([
      "**Scenarios passed**",
      ...scorecards.map((s) => `**${ratio(s.totals.passed, s.totals.passed + s.totals.failed)}**`),
    ]),
  ];
  for (const dimension of DIMENSIONS) {
    lines.push(
      row([
        DIMENSION_LABELS[dimension],
        ...scorecards.map((s) => {
          const score = s.dimensions.find((d) => d.dimension === dimension);
          return score ? ratio(score.passed, score.graded) : "n/a";
        }),
      ]),
    );
  }
  lines.push(
    row([
      "Not graded (rate limit or error)",
      ...scorecards.map((s) => String(s.totals.notRun + s.totals.errored)),
    ]),
  );
  const judges = [...new Set(scorecards.flatMap((s) => (s.judge ? [s.judge] : [])))];
  const dates = scorecards.map((s) => s.startedAt.slice(0, 10)).sort();
  lines.push(
    "",
    `Golden scenarios per run: ${[...new Set(scorecards.map((s) => s.totals.scenarios))].join(", ")}. ` +
      (judges.length > 0
        ? `Draft Reply quality judged by ${judges.map((j) => `\`${j}\``).join(", ")}. `
        : "No Draft Reply judge. ") +
      `Run ${dates[0] === dates.at(-1) ? `on ${dates[0]}` : `between ${dates[0]} and ${dates.at(-1)}`}.`,
  );
  return lines.join("\n");
}

export const README_SCORECARD_START = "<!-- scorecard:start -->";
export const README_SCORECARD_END = "<!-- scorecard:end -->";

/** Replace the scorecard between the README's scorecard markers. */
export function embedInReadme(readme: string, table: string): string {
  const start = readme.indexOf(README_SCORECARD_START);
  const end = readme.indexOf(README_SCORECARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`The README has no ${README_SCORECARD_START} … ${README_SCORECARD_END} block to fill.`);
  }
  return `${readme.slice(0, start + README_SCORECARD_START.length)}\n${table}\n${readme.slice(end)}`;
}
