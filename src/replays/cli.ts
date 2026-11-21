/**
 * Turn a saved trace into a replay that the Demo workspace serves.
 *
 *   npm run replay -- eval-runs/<run>/traces/emergency-burst-pipe.json
 *   npm run replay -- run.json --message message.json --board board.json --id my-run --title "My run"
 *
 * The trace file is either a bare trace (what the eval runner writes to traces/<scenario>.json)
 * or a live run's response from POST /api/intake (its `trace` field is used).
 *
 * The Message and starting Board come from the golden scenario with the trace's file name (or
 * --scenario), or from --message and --board JSON files. The model is read from the eval run's
 * scorecard.json, or given with --model. The replay is written to replays/<id>.json.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MessageSchema, WorkOrderSchema } from "@/domain";
import { goldenScenarios } from "@/evals/golden-scenarios";
import { REPLAYS_DIR, replayFromTraceFile, saveReplay } from "./files";

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      scenario: { type: "string" },
      message: { type: "string" },
      board: { type: "string" },
      model: { type: "string" },
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      out: { type: "string" },
    },
  });

  const [traceFile] = positionals;
  if (!traceFile || positionals.length > 1) {
    console.error("Usage: npm run replay -- <trace.json> [--scenario id | --message file.json [--board file.json]]");
    return 2;
  }

  const scenarioId = values.scenario ?? (values.message ? undefined : path.basename(traceFile, ".json"));
  const scenario = scenarioId === undefined ? undefined : goldenScenarios.find((s) => s.id === scenarioId);
  if (scenarioId !== undefined && !scenario) {
    console.error(`No golden scenario "${scenarioId}". Pass --scenario <id>, or --message <file.json> for a live run.`);
    return 2;
  }

  const message = values.message ? MessageSchema.parse(await readJson(values.message)) : scenario?.message;
  if (!message) return 2;
  const board = values.board ? z.array(WorkOrderSchema).parse(await readJson(values.board)) : scenario?.board;

  const replay = await replayFromTraceFile(traceFile, {
    message,
    board,
    model: values.model,
    id: values.id,
    title: values.title,
    description: values.description ?? scenario?.description,
  });
  console.log(`Replay written to ${await saveReplay(replay, values.out ?? REPLAYS_DIR)}`);
  return 0;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
