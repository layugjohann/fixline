import { describe, expect, it } from "vitest";
import type { Message, Proposal, RoutingDecision, Trace, WorkOrder } from "@/domain";
import { createReplay } from "@/replays";
import { loadReplays } from "@/replays/files";
import { recordRun, seedSandbox } from "@/sandbox";
import { sandboxBoardMessages } from "@/fixtures";
import {
  boardColumns,
  boardLocations,
  boardTrades,
  demoEntryFromReplay,
  filterBoard,
  linkedMessages,
  sandboxMessages,
  demoReviewQueue,
  describeStep,
  headlineUrgency,
  pendingCount,
  proposalTitle,
  queueTab,
  sandboxQueueEntries,
  toolLabel,
  tradeLabel,
} from "./index";

const message: Message = {
  id: "msg-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body: "The kitchen sink tap is dripping.",
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
      description: "Kitchen sink tap drips.",
      trade: "plumbing",
      urgency: "routine",
    },
  ],
  reasoning: "A routine plumbing repair.",
};

function replayWith(steps: Trace["steps"], overrides: Partial<Message> = {}) {
  const replayMessage = { ...message, ...overrides };
  return createReplay({
    id: `replay-${replayMessage.id}`,
    model: "test:model",
    message: replayMessage,
    trace: { messageId: replayMessage.id, steps },
  });
}

describe("the Demo Review Queue", () => {
  it("puts Proposals held for review and flagged emergencies under To review", () => {
    const held = demoEntryFromReplay(
      replayWith([
        { type: "proposal", proposal },
        { type: "routing", decision: { outcome: "review", rules: ["cross-tenant-match"], reason: "Cross-tenant." } },
      ]),
    );
    const flagged = demoEntryFromReplay(
      replayWith([
        { type: "proposal", proposal },
        { type: "routing", decision: { outcome: "apply-and-flag", rules: ["emergency"], reason: "Emergency." } },
      ]),
    );
    expect(held.status).toBe("pending");
    expect(flagged.status).toBe("flagged");
    expect([held, flagged].map((entry) => queueTab(entry.status))).toEqual(["to-review", "to-review"]);
    expect(pendingCount([held, flagged])).toBe(2);
  });

  it("puts auto-applied, not-maintenance and rejected runs under Auto-handled", () => {
    const autoApplied = demoEntryFromReplay(
      replayWith([
        { type: "proposal", proposal },
        { type: "routing", decision: { outcome: "auto-apply", rules: [], reason: "Clear." } },
      ]),
    );
    const notMaintenance = demoEntryFromReplay(
      replayWith([
        { type: "proposal", proposal: { ...proposal, classification: "not-maintenance", operations: [] } },
        { type: "routing", decision: { outcome: "auto-apply", rules: [], reason: "No changes." } },
      ]),
    );
    const rejected = demoEntryFromReplay(
      replayWith([
        { type: "proposal", proposal },
        { type: "rejection", problems: ["Unknown Unit"] },
      ]),
    );
    expect(autoApplied.status).toBe("auto-applied");
    expect(notMaintenance.status).toBe("no-action");
    expect(rejected.status).toBe("not-applied");
    expect(rejected.rejectionProblems).toEqual(["Unknown Unit"]);
    expect(pendingCount([autoApplied, notMaintenance, rejected])).toBe(0);
  });

  it("lists the newest Message first", () => {
    const older = replayWith([], { id: "older", receivedAt: "2026-11-01T00:00:00Z" });
    const newer = replayWith([], { id: "newer", receivedAt: "2026-11-02T00:00:00Z" });
    expect(demoReviewQueue([older, newer]).map((entry) => entry.message.id)).toEqual(["newer", "older"]);
  });

  it("builds an entry for every recorded replay", async () => {
    const replays = await loadReplays();
    const entries = demoReviewQueue(replays);
    expect(entries).toHaveLength(replays.length);
    expect(pendingCount(entries)).toBeGreaterThan(0);
  });
});

describe("the sandbox Review Queue", () => {
  const sandboxMessage: Message = { ...message, id: "msg-sandbox-1", receivedAt: "2026-11-20T10:00:00Z" };
  const trace: Trace = { messageId: sandboxMessage.id, steps: [{ type: "proposal", proposal }] };

  it("shows every seeded Review Queue entry, with no trace", () => {
    const sandbox = seedSandbox();
    const entries = sandboxQueueEntries(sandbox);
    expect(entries.map((entry) => entry.reviewEntryId).sort()).toEqual(sandbox.reviewQueue.map((entry) => entry.id).sort());
    expect(entries.every((entry) => entry.trace === undefined)).toBe(true);
    expect(pendingCount(entries)).toBe(sandbox.reviewQueue.filter((entry) => entry.status === "pending").length);
  });

  it("links a held Proposal to the run that queued it", () => {
    const seeded = seedSandbox();
    const routing: RoutingDecision = { outcome: "review", rules: ["unknown-sender"], reason: "Unknown." };
    const queued = {
      ...seeded.reviewQueue[0]!,
      id: "RQ-99",
      message: sandboxMessage,
      proposal,
      routing,
      status: "pending" as const,
    };
    const sandbox = recordRun(seeded, {
      message: sandboxMessage,
      proposal,
      routing,
      trace,
      board: seeded.board,
      reviewQueue: [...seeded.reviewQueue, queued],
    });
    const [newest] = sandboxQueueEntries(sandbox);
    expect(newest).toMatchObject({ id: "RQ-99", reviewEntryId: "RQ-99", status: "pending", trace, title: "Dripping kitchen sink tap" });
  });

  it("shows a run applied without review under Auto-handled, with nothing to decide", () => {
    const seeded = seedSandbox();
    const sandbox = recordRun(seeded, {
      message: sandboxMessage,
      proposal,
      routing: { outcome: "auto-apply", rules: [], reason: "Clear." },
      trace,
      board: seeded.board,
      reviewQueue: seeded.reviewQueue,
    });
    const [newest] = sandboxQueueEntries(sandbox);
    expect(newest).toMatchObject({ id: "run-1", status: "auto-applied", trace });
    expect(newest?.reviewEntryId).toBeUndefined();
    expect(queueTab(newest!.status)).toBe("auto-handled");
  });

  it("puts decided entries under Auto-handled", () => {
    expect(["approved", "rejected", "acknowledged"].map((status) => queueTab(status as "approved"))).toEqual([
      "auto-handled",
      "auto-handled",
      "auto-handled",
    ]);
  });

  it("titles a Proposal by its first change", () => {
    expect(proposalTitle(proposal, message)).toBe("Dripping kitchen sink tap");
    expect(
      proposalTitle(
        { ...proposal, operations: [{ type: "attach", workOrderId: "WO-2", matchType: "same-tenant", information: "x" }] },
        message,
      ),
    ).toBe("Update to WO-2");
    expect(proposalTitle({ ...proposal, classification: "not-maintenance", operations: [] }, message)).toBe(
      "Not a maintenance matter",
    );
  });
});

describe("headlineUrgency", () => {
  const board: WorkOrder[] = [
    {
      id: "WO-1",
      location: { type: "unit", unitId: "harbor-view-2a" },
      title: "Heater dead",
      description: "",
      trade: "hvac",
      urgency: "urgent",
      status: "open",
      messageIds: [],
    },
  ];

  it("is the most urgent of the new Work Orders and the ones attached to", () => {
    const attachAndCreate: Proposal = {
      ...proposal,
      operations: [
        ...proposal.operations,
        { type: "attach", workOrderId: "WO-1", matchType: "same-tenant", information: "Still dead." },
      ],
    };
    expect(headlineUrgency(attachAndCreate, board)).toBe("urgent");
    expect(headlineUrgency(proposal, board)).toBe("routine");
    expect(headlineUrgency(undefined, board)).toBeUndefined();
  });
});

describe("describeStep", () => {
  it("describes every kind of step, including rejections and retries", () => {
    expect(describeStep({ type: "model-turn", text: "Looking up the Sender." }).label).toBe("Model turn");
    expect(
      describeStep({ type: "tool-call", toolName: "searchWorkOrders", input: { unitId: "harbor-view-2a" }, output: [] }),
    ).toEqual({ kind: "tool-call", label: "Search Work Orders", detail: '{"unitId":"harbor-view-2a"}' });
    expect(describeStep({ type: "proposal", proposal }).detail).toBe("1 change");
    expect(
      describeStep({ type: "routing", decision: { outcome: "auto-apply", rules: [], reason: "Clear." } }).label,
    ).toBe("Routing decision: auto-apply");
    expect(describeStep({ type: "rejection", problems: ["a", "b"] })).toEqual({
      kind: "rejection",
      label: "Rejected by validation",
      detail: "a; b",
    });
    expect(describeStep({ type: "rejected-tool-call", explanation: "Unknown tool." }).label).toBe("Tool call rejected");
    expect(describeStep({ type: "retry", attempt: 1, maxRetries: 2 }).label).toBe("Retry 1 of 2");
  });
});

describe("labels", () => {
  it("names tools and Trades readably", () => {
    expect(toolLabel("lookUpSender")).toBe("Look up Sender");
    expect(toolLabel("getWorkOrder")).toBe("Get Work Order");
    expect(tradeLabel("hvac")).toBe("HVAC");
    expect(tradeLabel("pest-control")).toBe("Pest control");
  });
});

describe("the Board", () => {
  const workOrder = (overrides: Partial<WorkOrder> & Pick<WorkOrder, "id">): WorkOrder => ({
    location: { type: "unit", unitId: "harbor-view-2a" },
    title: overrides.id,
    description: "",
    trade: "plumbing",
    urgency: "routine",
    status: "open",
    messageIds: [],
    ...overrides,
  });
  const board: WorkOrder[] = [
    workOrder({ id: "WO-1", urgency: "routine" }),
    workOrder({ id: "WO-2", urgency: "emergency", trade: "electrical" }),
    workOrder({ id: "WO-3", urgency: "urgent", status: "closed" }),
    workOrder({ id: "WO-4", urgency: "urgent", location: { type: "common-area", commonAreaId: "harbor-view-lobby" } }),
  ];

  it("puts open Work Orders in a column per Urgency and closed ones in a Closed column", () => {
    const columns = boardColumns(board);
    expect(columns.map((column) => [column.label, column.workOrders.map((candidate) => candidate.id)])).toEqual([
      ["Emergency", ["WO-2"]],
      ["Urgent", ["WO-4"]],
      ["Routine", ["WO-1"]],
      ["Closed", ["WO-3"]],
    ]);
  });

  it("filters the table by Urgency, Trade and Location, open and most urgent first", () => {
    expect(filterBoard(board, {}).map((candidate) => candidate.id)).toEqual(["WO-2", "WO-4", "WO-1", "WO-3"]);
    expect(filterBoard(board, { urgency: "urgent" }).map((candidate) => candidate.id)).toEqual(["WO-4", "WO-3"]);
    expect(filterBoard(board, { trade: "electrical" }).map((candidate) => candidate.id)).toEqual(["WO-2"]);
    expect(filterBoard(board, { location: "harbor-view-lobby" }).map((candidate) => candidate.id)).toEqual(["WO-4"]);
    expect(filterBoard(board, { urgency: "emergency", location: "harbor-view-lobby" })).toEqual([]);
  });

  it("lists the Trades and Locations on the Board once each", () => {
    expect(boardTrades(board)).toEqual(["plumbing", "electrical"]);
    expect(boardLocations(board)).toEqual([
      { type: "unit", unitId: "harbor-view-2a" },
      { type: "common-area", commonAreaId: "harbor-view-lobby" },
    ]);
  });

  it("finds a Work Order's linked Messages, oldest first, and reports the ones it doesn't hold", () => {
    const later: Message = { ...message, id: "msg-2", receivedAt: "2026-11-16T10:00:00Z" };
    const linked = linkedMessages(workOrder({ id: "WO-9", messageIds: ["msg-2", "msg-gone", "msg-1"] }), [later, message]);
    expect(linked.messages.map((candidate) => candidate.id)).toEqual(["msg-1", "msg-2"]);
    expect(linked.missing).toEqual(["msg-gone"]);
  });

  it("holds every Message of a sandbox, including its seeded Board's", () => {
    const sandbox = seedSandbox();
    const messages = sandboxMessages(sandbox, sandboxBoardMessages);
    for (const seeded of sandbox.board) {
      expect(linkedMessages(seeded, messages).missing).toEqual([]);
    }
    expect(messages.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining([...sandbox.incomingMessages.map((item) => item.message.id), sandbox.reviewQueue[0]!.message.id]),
    );
  });
});
