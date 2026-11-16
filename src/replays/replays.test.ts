import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal } from "@/domain";
import { goldenScenarios } from "@/evals/golden-scenarios";
import { runEvals } from "@/evals/runner";
import { propertyRoster } from "@/fixtures";
import { runIntake } from "@/intake";
import { InMemoryReviewQueue } from "@/review-queue";
import { createReplay } from "@/replays";
import { loadReplays, replayFromTraceFile, saveReplay } from "@/replays/files";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function turn(text: string | undefined, toolName: string, input: unknown) {
  return {
    content: [
      ...(text ? [{ type: "text" as const, text }] : []),
      { type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

const message: Message = {
  id: "msg-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body: "The kitchen sink tap is dripping and there's a puddle under the cabinet.",
};

const proposal: Proposal = {
  classification: "maintenance",
  uncertain: false,
  draftReplies: [],
  operations: [
    {
      type: "create",
      location: { type: "unit", unitId: "harbor-view-2a" },
      title: "Dripping kitchen sink tap",
      description: "Kitchen sink tap drips; puddle under the cabinet.",
      trade: "plumbing",
      urgency: "urgent",
    },
  ],
  reasoning: "Known Tenant in Unit 2A reports one plumbing problem.",
};

function scriptedModel() {
  return new MockLanguageModelV4({
    doGenerate: [
      turn("Looking up the Sender.", "lookUpSender", { email: message.sender.email }),
      turn(undefined, "searchOpenWorkOrders", { unitId: "harbor-view-2a" }),
      turn(undefined, "submitProposal", proposal),
    ],
  });
}

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("Replay mode", () => {
  it("loads every recorded replay without a model or a key", async () => {
    const replays = await loadReplays();

    expect(replays.length).toBeGreaterThan(0);
    for (const replay of replays) {
      expect(replay.trace.messageId).toBe(replay.message.id);
      expect(replay.trace.steps.some((step) => step.type === "proposal")).toBe(true);
    }
  });

  it("turns a live run's saved response into a replay with every step intact", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fixline-replay-"));
    const board = new FakeBoard();
    const reviewQueue = new InMemoryReviewQueue();
    const result = await runIntake(message, { model: scriptedModel(), board, propertyRoster, reviewQueue });
    // What POST /api/intake returns: the Intake result plus the updated Board and Review Queue.
    const responseFile = path.join(dir, "live-run.json");
    await writeFile(
      responseFile,
      JSON.stringify({ ...result, board: board.snapshot(), reviewQueue: reviewQueue.snapshot() }),
    );

    const replay = await replayFromTraceFile(responseFile, { message, model: "test-model", title: "Dripping tap" });
    await saveReplay(replay, path.join(dir, "replays"));
    const [loaded] = await loadReplays(path.join(dir, "replays"));

    expect(loaded).toMatchObject({ id: "live-run", title: "Dripping tap", model: "test-model", message });
    expect(loaded?.trace).toEqual(result.trace);
    expect(loaded?.trace.steps.map((step) => step.type)).toEqual(
      expect.arrayContaining(["model-turn", "tool-call", "proposal", "routing"]),
    );
  });

  it("turns eval-run traces into replays, taking the model from the run's scorecard", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fixline-replay-"));
    const scenario = goldenScenarios.find((candidate) => candidate.id === "not-maintenance-rent-question")!;
    const failing = goldenScenarios.find((candidate) => candidate.id === "routine-blown-bulb")!;
    const notMaintenance: Proposal = {
      classification: "not-maintenance",
      uncertain: false,
      draftReplies: [],
      operations: [],
      reasoning: "Rent question.",
    };
    const model = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        const isRent = JSON.stringify(prompt).includes(scenario.message.id);
        const lookedUp = prompt.some((entry) => entry.role === "tool");
        if (!lookedUp) return turn(undefined, "lookUpSender", { email: "maya.okafor@example.com" });
        // The bulb scenario ends without a Proposal, so its trace stops early.
        return isRent ? turn(undefined, "submitProposal", notMaintenance) : turn("Done.", "submitProposal", {});
      },
    });
    const outputDir = path.join(dir, "run");
    const run = await runEvals([scenario, failing], { model, modelName: "mock:scripted", outputDir });

    for (const evaluated of [scenario, failing]) {
      const replay = await replayFromTraceFile(path.join(outputDir, "traces", `${evaluated.id}.json`), {
        message: evaluated.message,
        board: evaluated.board,
      });
      expect(replay).toMatchObject({
        id: evaluated.id,
        model: "mock:scripted",
        recordedAt: run.scorecard.startedAt,
        message: evaluated.message,
        board: evaluated.board,
      });
      expect(replay.trace).toEqual(run.traces[evaluated.id]);
    }
  });

  it("refuses a trace that belongs to a different Message", async () => {
    const result = await runIntake(message, {
      model: scriptedModel(),
      board: new FakeBoard(),
      propertyRoster,
      reviewQueue: new InMemoryReviewQueue(),
    });

    expect(() =>
      createReplay({ id: "mismatch", model: "test-model", message: { ...message, id: "msg-other" }, trace: result.trace }),
    ).toThrow(/trace must belong/);
  });
});
