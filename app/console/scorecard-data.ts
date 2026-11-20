import { cache } from "react";
import { scorecardPageData } from "@/console/scorecard";
import { loadEvalRuns } from "@/evals/eval-runs";

/**
 * The Scorecard page's data, read from the committed eval runs when the pages are built, so the
 * page makes no model calls and needs no key.
 */
export const loadScorecard = cache(async () => scorecardPageData(await loadEvalRuns()));

/** Every (run, scenario) the Scorecard links to a trace for: one static page each. */
export async function scorecardTraceParams(): Promise<{ runId: string; scenarioId: string }[]> {
  const { scenarios } = await loadScorecard();
  return scenarios.flatMap((row) => row.cells.flatMap((cell) => (cell.trace ? [cell.trace] : [])));
}
