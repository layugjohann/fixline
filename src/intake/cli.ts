/**
 * Command-line Intake: runs one Message through Intake against a real Board.
 *
 *   npm run intake -- --from maya.okafor@example.com --body "The kitchen tap is dripping"
 *   npm run intake -- --file message.json          # a Message as JSON (id, sender, receivedAt, body)
 *   echo "The lobby light is out" | npm run intake -- --from luis.romero@example.com
 *   npm run intake -- --board fake --body "..."    # try it on an empty in-memory Board instead
 *   npm run intake -- --model gemini --body "..."
 *
 * The Board defaults to the Trello board in TRELLO_BOARD_ID, with TRELLO_API_KEY and TRELLO_TOKEN
 * (run scripts/setup.sh trello). The model is FIXLINE_MODEL or --model, else Groq with a Gemini
 * fallback (see src/models). Free-tier models must only ever see synthetic data (ADR 0002).
 *
 * Prints the Proposal, the routing decision and the Work Orders it created or updated.
 * The Review Queue is in-memory and lasts only for this run, so anything sent to review is
 * printed and then discarded.
 * With --trace, prints the full trace as JSON as well.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { FakeBoard, type Board } from "@/board";
import { trelloBoardFromEnv } from "@/board/trello";
import { MessageSchema, locationId, type Message, type WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { configuredModel, createModel, parseModelSpec } from "@/models";
import { InMemoryReviewQueue } from "@/review-queue";
import { runIntake } from "./index";

const USAGE = `Usage: npm run intake -- [--from <email>] [--name <name>] (--body <text> | --file <message.json> | stdin)
                           [--board trello|fake] [--model <provider>[:<modelId>]] [--trace]`;

async function main(): Promise<number> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      name: { type: "string" },
      body: { type: "string" },
      file: { type: "string" },
      board: { type: "string", default: "trello" },
      model: { type: "string" },
      trace: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const message = readMessage(values);
  if (!message) {
    console.error(`No Message to run.\n${USAGE}`);
    return 2;
  }

  const board = chooseBoard(values.board);
  if (!board) {
    console.error(`Unknown --board "${values.board}". Use trello or fake.`);
    return 2;
  }
  const { model, name } = values.model ? createModel(parseModelSpec(values.model)) : configuredModel();

  console.log(`Running Intake on Message ${message.id} from ${message.sender.email} (${name}, ${values.board} Board)…\n`);
  const reviewQueue = new InMemoryReviewQueue();
  const result = await runIntake(message, { model, board, propertyRoster, reviewQueue });

  const { proposal, routing } = result;
  console.log(`Classification: ${proposal.classification}`);
  console.log(`Reasoning:      ${proposal.reasoning}`);
  console.log(`Routing:        ${routing.outcome} (${routing.reason})`);
  console.log("\nOperations:");
  if (proposal.operations.length === 0) console.log("  (none)");
  for (const operation of proposal.operations) {
    console.log(
      operation.type === "create"
        ? `  create  ${operation.title} [${operation.urgency}, ${operation.trade}, ${locationId(operation.location)}]`
        : `  attach  ${operation.workOrderId}: ${operation.information}`,
    );
  }
  printWorkOrders("Created on the Board", result.createdWorkOrders);
  printWorkOrders("Updated on the Board", result.updatedWorkOrders);
  const pending = reviewQueue.snapshot();
  if (pending.length > 0) {
    console.log("\nSent to the Review Queue (not kept after this run):");
    for (const entry of pending) console.log(`  ${entry.id}  ${entry.routing.outcome} (${entry.routing.reason})`);
  }
  if (values.trace) console.log(`\nTrace:\n${JSON.stringify(result.trace, null, 2)}`);
  return 0;
}

function readMessage(values: { from?: string; name?: string; body?: string; file?: string }): Message | undefined {
  if (values.file) return MessageSchema.parse(JSON.parse(readFileSync(values.file, "utf8")));
  const body = values.body ?? (process.stdin.isTTY ? undefined : readFileSync(0, "utf8"));
  if (!body?.trim()) return undefined;
  const receivedAt = new Date();
  return MessageSchema.parse({
    id: `msg-cli-${receivedAt.getTime()}`,
    sender: { email: values.from ?? "unknown@example.com", ...(values.name ? { name: values.name } : {}) },
    receivedAt: receivedAt.toISOString(),
    body,
  });
}

function chooseBoard(kind: string | undefined): Board | undefined {
  if (kind === "trello") return trelloBoardFromEnv();
  if (kind === "fake") return new FakeBoard();
  return undefined;
}

function printWorkOrders(heading: string, workOrders: readonly WorkOrder[]): void {
  if (workOrders.length === 0) return;
  console.log(`\n${heading}:`);
  for (const workOrder of workOrders) {
    console.log(
      `  ${workOrder.id}  ${workOrder.title} [${workOrder.urgency}, ${workOrder.trade}, ${locationId(workOrder.location)}]`,
    );
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
