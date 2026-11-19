/**
 * Command-line eval runner.
 *
 *   npm run eval                                # every golden scenario
 *   npm run eval -- --scenario emergency-burst-pipe --scenario urgent-fridge-not-cooling
 *   npm run eval -- --tag emergency --out eval-runs/my-run
 *   npm run eval:smoke                          # the CI smoke subset (--tag smoke)
 *   npm run eval -- --model gemini
 *   npm run eval -- --model claude:claude-sonnet-5-5
 *   npm run eval -- --judge claude:claude-sonnet-5-5
 *   npm run eval -- --no-judge
 *
 * --model takes a model spec, `<provider>[:<modelId>]` with provider groq, gemini, claude or openai
 * (see src/models). It defaults to FIXLINE_MODEL, then groq. Evals pin one model and never fall back,
 * so the scorecard always describes the model it names.
 *
 * --judge takes a model spec for the LLM judge that grades Draft Reply quality against the rubric in
 * draft-reply-rubric.ts. It defaults to FIXLINE_JUDGE_MODEL, then the --model spec. --no-judge skips
 * the reply-quality dimension.
 *
 * Exits 1 if any scenario fails or errors. Scenarios stopped by a rate limit or quota are reported
 * as not run, not as failures; if nothing could be graded at all the exit code is 3.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createModel, parseModelSpec, withRateLimitWait } from "@/models";
import { goldenScenarios } from "./golden-scenarios";
import { runEvals } from "./runner";
import { formatScorecard } from "./scorecard";

async function main(): Promise<number> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const { values } = parseArgs({
    options: {
      scenario: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      out: { type: "string" },
      model: { type: "string" },
      judge: { type: "string" },
      "no-judge": { type: "boolean" },
    },
  });

  const scenarios = goldenScenarios.filter(
    (scenario) =>
      (!values.scenario || values.scenario.includes(scenario.id)) &&
      (!values.tag || values.tag.some((tag) => scenario.tags.includes(tag))),
  );
  const unknown = (values.scenario ?? []).filter((id) => !goldenScenarios.some((s) => s.id === id));
  if (unknown.length > 0) {
    console.error(`Unknown scenario id(s): ${unknown.join(", ")}`);
    return 2;
  }
  if (scenarios.length === 0) {
    console.error("No scenarios match the given filters.");
    return 2;
  }

  const outputDir = values.out ?? path.join("eval-runs", new Date().toISOString().replace(/[:.]/g, "-"));
  const modelSpec = values.model ?? process.env.FIXLINE_MODEL ?? "groq";
  const { model, name } = createModel(parseModelSpec(modelSpec));
  const judge = values["no-judge"]
    ? undefined
    : createModel(parseModelSpec(values.judge ?? process.env.FIXLINE_JUDGE_MODEL ?? modelSpec));

  console.log(
    `Running ${scenarios.length} scenario(s) on ${name}` +
      (judge ? `, Draft Replies judged by ${judge.name}…` : ", without a Draft Reply judge…"),
  );
  // Free tiers refuse calls for a few seconds at a time (tokens per minute): wait them out rather
  // than mark scenarios not run. A used-up daily quota still stops the run.
  const { scorecard } = await runEvals(scenarios, {
    model: withRateLimitWait(model),
    modelName: name,
    ...(judge ? { judge: withRateLimitWait(judge.model), judgeName: judge.name } : {}),
    outputDir,
    onScenario: (result) => console.log(`  ${result.status.toUpperCase().padEnd(7)} ${result.scenarioId}`),
  });

  console.log(`\n${formatScorecard(scorecard)}\n`);
  console.log(`Scorecard: ${path.join(outputDir, "scorecard.json")} (Markdown: scorecard.md)`);
  console.log(`Traces:    ${path.join(outputDir, "traces")}/`);
  const { totals } = scorecard;
  if (totals.failed + totals.errored > 0) return 1;
  if (totals.notRun === totals.scenarios) return 3;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
