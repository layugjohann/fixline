/**
 * Reading saved eval runs. Node only: the console's Scorecard page reads them at build time and
 * ships them as static data, so it makes no model calls.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ScorecardFileSchema, type EvalRunFiles } from "@/console/scorecard";
import { TraceSchema, type Trace } from "@/domain";

/**
 * Where eval runs live: one directory per run, holding `scorecard.json` and `traces/<scenario>.json`.
 * turbopackIgnore stops the build tracing the whole project because of it.
 */
export const EVAL_RUNS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "eval-runs");

/** Every run directory with a scorecard.json, sorted by name. Throws on a scorecard that doesn't parse. */
export async function loadEvalRuns(dir: string = EVAL_RUNS_DIR): Promise<EvalRunFiles[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const runs: EvalRunFiles[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name, "scorecard.json");
    if (!existsSync(file)) continue;
    let scorecard;
    try {
      scorecard = ScorecardFileSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      throw new Error(`${file} is not a valid scorecard: ${error instanceof Error ? error.message : error}`);
    }
    const traceDir = path.join(dir, entry.name, "traces");
    const traceIds = existsSync(traceDir)
      ? (await readdir(traceDir)).filter((name) => name.endsWith(".json")).map((name) => path.basename(name, ".json"))
      : [];
    runs.push({ runId: entry.name, scorecard, traceIds });
  }
  return runs;
}

/** One scenario's trace from an eval run, or undefined if the run kept none. */
export async function loadEvalTrace(
  runId: string,
  scenarioId: string,
  dir: string = EVAL_RUNS_DIR,
): Promise<Trace | undefined> {
  if ([runId, scenarioId].some((part) => part !== path.basename(part) || part.startsWith("."))) return undefined;
  const file = path.join(dir, runId, "traces", `${scenarioId}.json`);
  if (!existsSync(file)) return undefined;
  return TraceSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
