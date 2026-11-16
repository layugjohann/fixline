import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { POST as decideOnReviewQueue } from "../../app/api/review-queue/route";
import { FakeBoard } from "@/board";
import type { Proposal } from "@/domain";
import { inboxMessages, propertyRoster, sandboxBoard, sandboxReviewQueue } from "@/fixtures";
import { InvalidProposalError, runIntake } from "@/intake";
import { InMemoryReviewQueue } from "@/review-queue";
import {
  SandboxSchema,
  loadSandbox,
  recordDecision,
  recordRejection,
  recordRun,
  seedSandbox,
  sendMessage,
  serialiseSandbox,
  type Sandbox,
} from "@/sandbox";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function submitTurn(proposal: Proposal) {
  return {
    content: [
      { type: "tool-call" as const, toolCallId: "call-1", toolName: "submitProposal", input: JSON.stringify(proposal) },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

/** Process one inbox Message in a sandbox the way the live page does: Intake on its state, then record the run. */
async function processMessage(sandbox: Sandbox, messageId: string, proposal: Proposal): Promise<Sandbox> {
  const item = sandbox.inbox.find((candidate) => candidate.message.id === messageId)!;
  const board = new FakeBoard(sandbox.board);
  const reviewQueue = new InMemoryReviewQueue(sandbox.reviewQueue);
  const result = await runIntake(item.message, {
    model: new MockLanguageModelV4({ doGenerate: [submitTurn(proposal)] }),
    board,
    propertyRoster,
    reviewQueue,
  });
  return recordRun(sandbox, {
    message: item.message,
    proposal: result.proposal,
    routing: result.routing,
    trace: result.trace,
    board: board.snapshot(),
    reviewQueue: reviewQueue.snapshot(),
  });
}

async function decide(sandbox: Sandbox, entryId: string, decision: "approve" | "reject"): Promise<Sandbox> {
  const response = await decideOnReviewQueue(
    new Request("http://localhost/api/review-queue", {
      method: "POST",
      body: JSON.stringify({ decision, entryId, board: sandbox.board, reviewQueue: sandbox.reviewQueue }),
    }),
  );
  expect(response.status).toBe(200);
  return recordDecision(sandbox, SandboxSchema.pick({ board: true, reviewQueue: true }).parse(await response.json()));
}

const lobbyAttach: Proposal = {
  classification: "maintenance",
  operations: [
    {
      type: "attach",
      workOrderId: "WO-2",
      matchType: "cross-tenant",
      information: "Still flickering; Sam reports a trip hazard.",
    },
  ],
  uncertain: false,
  draftReplies: [],
  reasoning: "Same lobby light as WO-2.",
};

describe("Demo sandbox", () => {
  it("seeds a first visit from fixtures with every inbox Message unprocessed", () => {
    const sandbox = loadSandbox(null);

    expect(sandbox.board).toEqual(sandboxBoard);
    expect(sandbox.reviewQueue).toEqual(sandboxReviewQueue);
    expect(sandbox.inbox.map((item) => item.message)).toEqual(inboxMessages);
    expect(sandbox.inbox.every((item) => !item.processed)).toBe(true);
    expect(sandbox.history).toEqual([]);
  });

  it("seeds a Board whose Work Orders are in Units and Common Areas of the Property Roster", () => {
    const units = propertyRoster.properties.flatMap((property) => property.units.map((unit) => unit.id));
    const commonAreas = propertyRoster.properties.flatMap((property) => property.commonAreas.map((area) => area.id));
    for (const workOrder of seedSandbox().board) {
      const { location } = workOrder;
      expect(location.type === "unit" ? units : commonAreas).toContain(
        location.type === "unit" ? location.unitId : location.commonAreaId,
      );
    }
  });

  it("processes an inbox Message through Intake and records the run", async () => {
    const sandbox = await processMessage(seedSandbox(), "msg-inbox-lobby-follow-up", lobbyAttach);

    expect(sandbox.inbox.find((item) => item.message.id === "msg-inbox-lobby-follow-up")?.processed).toBe(true);
    expect(sandbox.inbox.filter((item) => item.processed)).toHaveLength(1);
    expect(sandbox.history).toHaveLength(1);
    expect(sandbox.history[0]?.routing.rules).toContain("cross-tenant-match");
    // A cross-Tenant match waits for a Coordinator; the Board is unchanged.
    expect(sandbox.board).toEqual(sandboxBoard);
    expect(sandbox.reviewQueue.map((entry) => [entry.message.id, entry.status])).toEqual([
      ["msg-seed-unknown-bike-store", "pending"],
      ["msg-inbox-lobby-follow-up", "pending"],
    ]);
  });

  it("records a Proposal that validation rejected, leaving the Message unprocessed and the Board untouched", async () => {
    const seeded = seedSandbox();
    const item = seeded.inbox.find((candidate) => candidate.message.id === "msg-inbox-lobby-follow-up")!;
    const attachToMissing: Proposal = {
      ...lobbyAttach,
      operations: [{ ...lobbyAttach.operations[0]!, workOrderId: "WO-404" } as Proposal["operations"][number]],
    };
    const error = await runIntake(item.message, {
      model: new MockLanguageModelV4({ doGenerate: [submitTurn(attachToMissing)] }),
      board: new FakeBoard(seeded.board),
      propertyRoster,
      reviewQueue: new InMemoryReviewQueue(seeded.reviewQueue),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidProposalError);
    const { problems, trace } = error as InvalidProposalError;

    const sandbox = recordRejection(seeded, { message: item.message, problems, trace });

    expect(sandbox.rejections).toEqual([{ message: item.message, problems, trace }]);
    expect(sandbox.board).toEqual(seeded.board);
    expect(sandbox.reviewQueue).toEqual(seeded.reviewQueue);
    expect(sandbox.inbox).toEqual(seeded.inbox);
    expect(sandbox.history).toEqual([]);
    expect(loadSandbox(serialiseSandbox(sandbox))).toEqual(sandbox);
  });

  it("adds a Message sent as a Tenant, or as a new Sender, to the inbox", () => {
    const first = sendMessage(
      seedSandbox(),
      { email: "luis.romero@example.com", name: "Luis Romero" },
      "Stairwell light is out.",
      "2026-11-16T20:00:00Z",
    );
    const second = sendMessage(first.sandbox, { email: " new.person@example.org ", name: " " }, "Hello?", "2026-11-16T20:05:00Z");

    expect(first.message).toEqual({
      id: "msg-sandbox-1",
      sender: { email: "luis.romero@example.com", name: "Luis Romero" },
      receivedAt: "2026-11-16T20:00:00Z",
      body: "Stairwell light is out.",
    });
    expect(second.message.id).toBe("msg-sandbox-2");
    expect(second.message.sender).toEqual({ email: "new.person@example.org" });
    expect(second.sandbox.inbox.slice(-2)).toEqual([
      { message: first.message, processed: false },
      { message: second.message, processed: false },
    ]);
  });

  it("survives a round trip through browser storage, and reseeds when what's stored can't be read", async () => {
    const sandbox = await processMessage(seedSandbox(), "msg-inbox-lobby-follow-up", lobbyAttach);

    expect(loadSandbox(serialiseSandbox(sandbox))).toEqual(sandbox);
    expect(loadSandbox("not json")).toEqual(seedSandbox());
    expect(loadSandbox(JSON.stringify({ version: 0, board: [] }))).toEqual(seedSandbox());
  });

  it("resets to the seeded state after the visitor has worked it", async () => {
    let sandbox = await processMessage(seedSandbox(), "msg-inbox-lobby-follow-up", lobbyAttach);
    sandbox = await decide(sandbox, "RQ-1", "approve");
    expect(sandbox.board).not.toEqual(sandboxBoard);

    expect(seedSandbox()).toEqual(loadSandbox(null));
    expect(seedSandbox().board).toEqual(sandboxBoard);
    expect(seedSandbox().reviewQueue).toEqual(sandboxReviewQueue);
  });

  it("keeps two visitors' sandboxes independent, with no state kept on the server", async () => {
    const first = seedSandbox();
    const second = seedSandbox();

    const firstAfter = await decide(first, "RQ-1", "approve");
    const secondAfter = await decide(second, "RQ-1", "reject");

    // The first visitor's approval put the bike store Work Order on their Board only.
    expect(firstAfter.board.map((workOrder) => workOrder.title)).toContain("Bike store door lock doesn't catch");
    expect(firstAfter.reviewQueue[0]?.status).toBe("approved");
    expect(secondAfter.board).toEqual(sandboxBoard);
    expect(secondAfter.reviewQueue[0]?.status).toBe("rejected");
    // Neither request changed the other's seeded copy, or the fixtures.
    expect(first.board).toEqual(sandboxBoard);
    expect(second.reviewQueue).toEqual(sandboxReviewQueue);
    expect(seedSandbox().reviewQueue[0]?.status).toBe("pending");
  });
});
