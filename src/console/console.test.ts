import { describe, expect, it } from "vitest";
import type { Message, Proposal, Trace, WorkOrder } from "@/domain";
import { createReplay } from "@/replays";
import { loadReplays } from "@/replays/files";
import {
  demoEntryFromReplay,
  demoReviewQueue,
  describeStep,
  headlineUrgency,
  pendingCount,
  queueTab,
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
