/**
 * Reading and writing replay files. Node only: the web app reads replays at
 * build time and ships them as static data.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TraceSchema, type Message, type WorkOrder } from "@/domain";
import { createReplay, parseReplay, type Replay } from "./index";

/**
 * Where recorded replays live. Every `*.json` file here is shown in the Demo workspace.
 * The landing page reads them at build time, so the server never needs these files
 * at runtime; turbopackIgnore stops the build tracing the whole project because of it.
 */
export const REPLAYS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "replays");

/** Load every replay in a directory, sorted by file name. Throws on a file that isn't a valid replay. */
export async function loadReplays(dir: string = REPLAYS_DIR): Promise<Replay[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const replays: Replay[] = [];
  for (const file of files) {
    try {
      replays.push(parseReplay(JSON.parse(await readFile(path.join(dir, file), "utf8"))));
    } catch (error) {
      throw new Error(`${path.join(dir, file)} is not a valid replay: ${error instanceof Error ? error.message : error}`);
    }
  }
  return replays;
}

/** Write a replay as `<id>.json` and return the path written. */
export async function saveReplay(replay: Replay, dir: string = REPLAYS_DIR): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${replay.id}.json`);
  await writeFile(file, `${JSON.stringify(replay, null, 2)}\n`);
  return file;
}

export interface SavedTraceOptions {
  /** The Message the trace is for. */
  message: Message;
  /** The Board the run started from. */
  board?: readonly WorkOrder[];
  /** The model that produced the trace. Read from an eval run's `scorecard.json` when omitted. */
  model?: string;
  id?: string;
  title?: string;
  description?: string;
}

/**
 * Turn a saved trace file into a replay. The file can hold a bare trace (as the
 * eval runner writes to `traces/<scenario>.json`) or a live run's response, whose
 * `trace` field is the trace.
 */
export async function replayFromTraceFile(traceFile: string, options: SavedTraceOptions): Promise<Replay> {
  const raw: unknown = JSON.parse(await readFile(traceFile, "utf8"));
  const candidate = typeof raw === "object" && raw !== null && "trace" in raw ? raw.trace : raw;
  const trace = TraceSchema.parse(candidate);

  // Eval runs keep their scorecard, which names the model, next to the traces directory.
  const scorecard = await readScorecard(path.join(path.dirname(traceFile), "..", "scorecard.json"));

  return createReplay({
    id: options.id ?? path.basename(traceFile, ".json"),
    title: options.title,
    description: options.description,
    model: options.model ?? scorecard?.model ?? "unknown model",
    recordedAt: scorecard?.startedAt,
    message: options.message,
    board: options.board,
    trace,
  });
}

const ScorecardHeaderSchema = z.object({ model: z.string(), startedAt: z.string() }).partial();

async function readScorecard(file: string): Promise<z.infer<typeof ScorecardHeaderSchema> | undefined> {
  if (!existsSync(file)) return undefined;
  const parsed = ScorecardHeaderSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  return parsed.success ? parsed.data : undefined;
}
