/**
 * Cross-model scorecard: compares saved eval runs side by side as a Markdown table for the README.
 *
 *   npm run eval -- --model groq   --out eval-runs/groq
 *   npm run eval -- --model gemini --out eval-runs/gemini
 *   npm run eval -- --model claude --out eval-runs/claude
 *   npm run eval:compare -- eval-runs/groq eval-runs/gemini eval-runs/claude
 *   npm run eval:compare -- eval-runs/groq eval-runs/gemini eval-runs/claude --readme README.md
 *
 * Each argument is an eval run directory (or its scorecard.json). The table goes to stdout, to
 * --out <file> if given, and with --readme <file> replaces the block between the README's
 * `<!-- scorecard:start -->` and `<!-- scorecard:end -->` markers.
 */
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ScorecardSummarySchema, embedInReadme, formatComparisonMarkdown } from "./scorecard";

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" }, readme: { type: "string" } },
  });
  if (positionals.length === 0) {
    console.error("Usage: npm run eval:compare -- <eval-run-dir>... [--out <file>] [--readme README.md]");
    return 2;
  }

  const scorecards = [];
  for (const run of positionals) {
    const file = existsSync(run) && statSync(run).isDirectory() ? path.join(run, "scorecard.json") : run;
    scorecards.push(ScorecardSummarySchema.parse(JSON.parse(await readFile(file, "utf8"))));
  }
  const table = formatComparisonMarkdown(scorecards);

  console.log(table);
  if (values.out) await writeFile(values.out, `${table}\n`);
  if (values.readme) {
    await writeFile(values.readme, embedInReadme(await readFile(values.readme, "utf8"), table));
    console.error(`\nScorecard embedded in ${values.readme}.`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
