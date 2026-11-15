/**
 * Command-line eval runner.
 *
 *   npm run eval                                # every golden scenario
 *   npm run eval -- --scenario emergency-burst-pipe --scenario urgent-fridge-not-cooling
 *   npm run eval -- --tag emergency --out eval-runs/my-run
 *
 * Uses the configured model (see src/models). Exits 1 if any scenario fails or errors.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { defaultModel } from "@/models";
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
  const model = defaultModel();

  console.log(`Running ${scenarios.length} scenario(s)…`);
  const { scorecard } = await runEvals(scenarios, {
    model,
    outputDir,
    onScenario: (result) => console.log(`  ${result.status.toUpperCase().padEnd(5)} ${result.scenarioId}`),
  });

  console.log(`\n${formatScorecard(scorecard)}\n`);
  console.log(`Scorecard: ${path.join(outputDir, "scorecard.json")}`);
  console.log(`Traces:    ${path.join(outputDir, "traces")}/`);
  return scorecard.totals.failed + scorecard.totals.errored > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
