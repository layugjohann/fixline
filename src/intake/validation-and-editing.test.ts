/**
 * Proposal validation, a Coordinator editing a queued Proposal, and the
 * apply-time check that sends a stale Proposal back to review. All through the
 * Intake entry point and the Coordinator's decisions, with a scripted mock model.
 */
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal, WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  InvalidEditError,
  InvalidProposalError,
  ReviewQueueEntryNotResolvableError,
  approveProposal,
  editProposal,
  rejectProposal,
  runIntake,
} from "@/intake";
import { InMemoryReviewQueue } from "@/review-queue";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function toolCallTurn(toolCallId: string, toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

/** A mock model scripted to look up the Sender, then submit the given Proposal (valid or not). */
function scriptedModel(message: Message, submitted: unknown) {
  return new MockLanguageModelV4({
    doGenerate: [
      toolCallTurn("call-1", "lookUpSender", { email: message.sender.email }),
      toolCallTurn("call-2", "submitProposal", submitted),
    ],
  });
}

const MAYA = { email: "maya.okafor@example.com", name: "Maya Okafor" }; // Harbor View 2A
const SAM = { email: "sam.whitfield@example.com", name: "Sam Whitfield" }; // Harbor View 1A
const STRANGER = { email: "m.okafor.home@example.org", name: "Maya O." }; // not in the Property Roster

function messageFrom(sender: Message["sender"], body: string, id = "msg-1"): Message {
  return { id, sender, receivedAt: "2026-11-16T09:00:00Z", body };
}

function create(location: Extract<Proposal["operations"][number], { type: "create" }>["location"], urgency: "emergency" | "urgent" | "routine" = "routine") {
  return {
    type: "create" as const,
    location,
    title: "Problem",
    description: "Described problem.",
    trade: "plumbing" as const,
    urgency,
  };
}

function proposalOf(operations: Proposal["operations"], uncertain = false): Proposal {
  return { classification: "maintenance", operations, uncertain, draftReplies: [], reasoning: "Scripted." };
}

function attach(workOrderId: string, matchType: "same-tenant" | "cross-tenant" = "same-tenant") {
  return { type: "attach" as const, workOrderId, matchType, information: "More detail." };
}

/** Maya's own dripping tap, raised by Maya. */
const mayaTap: WorkOrder = {
  id: "WO-1",
  location: { type: "unit", unitId: "harbor-view-2a" },
  title: "Dripping kitchen tap",
  description: "Kitchen tap drips.",
  trade: "plumbing",
  urgency: "routine",
  status: "open",
  messageIds: ["msg-0"],
  raisedByTenantId: "tenant-maya",
};

/** Maya's boiler, fixed and closed. */
const mayaBoilerClosed: WorkOrder = {
  id: "WO-2",
  location: { type: "unit", unitId: "harbor-view-2a" },
  title: "Boiler pressure low",
  description: "Boiler kept losing pressure.",
  trade: "hvac",
  urgency: "urgent",
  status: "closed",
  messageIds: ["msg-0b"],
  raisedByTenantId: "tenant-maya",
};

/** A leak through Sam's (1A) bathroom ceiling, raised by Sam. */
const samCeilingLeak: WorkOrder = {
  id: "WO-3",
  location: { type: "unit", unitId: "harbor-view-1a" },
  title: "Water leaking through bathroom ceiling",
  description: "Water drips through the bathroom ceiling.",
  trade: "plumbing",
  urgency: "urgent",
  status: "open",
  messageIds: ["msg-0c"],
  raisedByTenantId: "tenant-sam",
};

/** Runs one Message through Intake, expecting Proposal validation to reject it. */
async function rejectedIntake(message: Message, submitted: unknown, board: FakeBoard) {
  const reviewQueue = new InMemoryReviewQueue();
  const before = await board.listWorkOrders();
  const error = await runIntake(message, {
    model: scriptedModel(message, submitted),
    board,
    propertyRoster,
    reviewQueue,
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof InvalidProposalError)) throw new Error(`Expected an InvalidProposalError, got ${String(error)}`);
  // Nothing reached the Board or the Review Queue.
  expect(await board.listWorkOrders()).toEqual(before);
  expect(await reviewQueue.list()).toEqual([]);
  return error;
}

describe("Proposal validation", () => {
  it("rejects an attach to a Work Order that isn't on the Board, recording why in the trace", async () => {
    const submitted = proposalOf([attach("WO-99")]);

    const error = await rejectedIntake(messageFrom(MAYA, "Tap still drips."), submitted, new FakeBoard([mayaTap]));

    expect(error.problems).toEqual(["Operation 1 attaches to Work Order WO-99, which isn't on the Board."]);
    expect(error.trace.messageId).toBe("msg-1");
    expect(error.trace.steps.slice(-2)).toEqual([
      { type: "proposal", proposal: submitted },
      { type: "rejection", problems: error.problems },
    ]);
  });

  it("rejects an attach to a closed Work Order even when the Proposal would be auto-applied", async () => {
    // A known Tenant's same-Tenant match, not uncertain: the review policy would auto-apply it.
    const error = await rejectedIntake(
      messageFrom(MAYA, "The boiler is losing pressure again."),
      proposalOf([attach("WO-2")]),
      new FakeBoard([mayaTap, mayaBoilerClosed]),
    );

    expect(error.problems).toEqual(["Operation 1 attaches to Work Order WO-2, which is closed."]);
  });

  it("keeps an attach to a closed Work Order out of the Review Queue too", async () => {
    await rejectedIntake(
      messageFrom(STRANGER, "I'm in 2A, the boiler is losing pressure again."),
      proposalOf([attach("WO-2", "cross-tenant")]),
      new FakeBoard([mayaBoilerClosed]),
    );
  });

  it("rejects a Work Order in a Unit or Common Area that isn't in the Property Roster", async () => {
    const error = await rejectedIntake(
      messageFrom(MAYA, "Tap drips, and the roof terrace door is broken."),
      proposalOf([
        create({ type: "unit", unitId: "harbor-view-9z" }),
        create({ type: "common-area", commonAreaId: "harbor-view-roof-terrace" }),
        create({ type: "unit", unitId: "harbor-view-2a" }),
      ]),
      new FakeBoard(),
    );

    expect(error.problems).toEqual([
      "Operation 1 creates a Work Order in Unit harbor-view-9z, which isn't in the Property Roster.",
      "Operation 2 creates a Work Order in Common Area harbor-view-roof-terrace, which isn't in the Property Roster.",
    ]);
  });

  it("rejects a Proposal that breaks the schema, recording why in the trace", async () => {
    const error = await rejectedIntake(
      messageFrom(MAYA, "The tap drips."),
      { ...proposalOf([create({ type: "unit", unitId: "harbor-view-2a" })]), uncertain: "maybe" },
      new FakeBoard(),
    );

    expect(error.problems).toEqual([expect.stringMatching(/^uncertain: /)]);
    expect(error.trace.steps.some((step) => step.type === "proposal")).toBe(false);
    expect(error.trace.steps.at(-1)).toEqual({ type: "rejection", problems: error.problems });
  });

  it("applies nothing, not even an emergency, from a Proposal that fails validation", async () => {
    await rejectedIntake(
      messageFrom(MAYA, "Water pouring from under the sink! Also the boiler is acting up again."),
      proposalOf([create({ type: "unit", unitId: "harbor-view-2a" }, "emergency"), attach("WO-2")]),
      new FakeBoard([mayaBoilerClosed]),
    );
  });
});

/** Sends a Proposal to the Review Queue and returns what a Coordinator needs to work it. */
async function queued(message: Message, proposal: Proposal, board: FakeBoard) {
  const reviewQueue = new InMemoryReviewQueue();
  const deps = { board, propertyRoster, reviewQueue };
  const result = await runIntake(message, { model: scriptedModel(message, proposal), ...deps });
  expect(result.routing.outcome).toBe("review");
  return { entryId: result.reviewQueueEntries[0]!.id, entry: result.reviewQueueEntries[0]!, deps, board, reviewQueue };
}

describe("a Coordinator editing a queued Proposal", () => {
  it("applies the Coordinator's edited operations and labels on approval, keeping the agent's Proposal on record", async () => {
    const agentProposal = proposalOf([create({ type: "unit", unitId: "harbor-view-2a" }, "routine")], true);
    const { entryId, deps, board } = await queued(
      messageFrom(MAYA, "Something's leaking somewhere in the kitchen, and Sam says his ceiling is wet."),
      agentProposal,
      new FakeBoard([samCeilingLeak]),
    );
    const edited: Proposal = {
      ...agentProposal,
      uncertain: false,
      operations: [
        { ...create({ type: "unit", unitId: "harbor-view-2a" }, "urgent"), trade: "plumbing", title: "Leak under kitchen sink" },
        attach("WO-3", "cross-tenant"),
      ],
    };

    const entry = await editProposal(entryId, edited, deps);

    expect(entry).toMatchObject({ status: "pending", proposal: edited, agentProposal });
    expect(await board.listWorkOrders()).toEqual([samCeilingLeak]);

    const approval = await approveProposal(entryId, deps);

    expect(approval.outcome).toBe("applied");
    expect(await board.listWorkOrders()).toMatchObject([
      { id: "WO-3", messageIds: ["msg-0c", "msg-1"] },
      { id: "WO-4", title: "Leak under kitchen sink", urgency: "urgent", raisedByTenantId: "tenant-maya" },
    ]);
  });

  it("refuses an edit that fails Proposal validation, leaving the entry as it was", async () => {
    const { entryId, entry, deps, reviewQueue } = await queued(
      messageFrom(MAYA, "Not sure what this drip is."),
      proposalOf([create({ type: "unit", unitId: "harbor-view-2a" })], true),
      new FakeBoard([mayaBoilerClosed]),
    );

    await expect(editProposal(entryId, proposalOf([attach("WO-2")]), deps)).rejects.toBeInstanceOf(InvalidEditError);
    await expect(editProposal(entryId, { classification: "maintenance" }, deps)).rejects.toBeInstanceOf(InvalidEditError);
    expect(await reviewQueue.list()).toEqual([entry]);
  });

  it("won't edit a Proposal a Coordinator has already decided", async () => {
    const proposal = proposalOf([create({ type: "unit", unitId: "harbor-view-2a" })], true);
    const { entryId, deps } = await queued(messageFrom(MAYA, "Drip?"), proposal, new FakeBoard());
    await rejectProposal(entryId, deps);

    await expect(editProposal(entryId, proposal, deps)).rejects.toBeInstanceOf(ReviewQueueEntryNotResolvableError);
  });
});

describe("approving a stale Proposal", () => {
  const crossTenantReport = messageFrom(MAYA, "Sam says water is coming through his ceiling from my flat.", "msg-maya");

  it("returns a Proposal to review instead of applying it when its Work Order changed in the meantime", async () => {
    const { entryId, deps, board, reviewQueue } = await queued(
      crossTenantReport,
      proposalOf([attach("WO-3", "cross-tenant")]),
      new FakeBoard([samCeilingLeak]),
    );
    // Meanwhile Sam's own follow-up is auto-applied to the same Work Order.
    const followUp = messageFrom(SAM, "The ceiling leak is worse now, the plaster is bulging.", "msg-sam");
    await runIntake(followUp, {
      model: scriptedModel(followUp, proposalOf([{ ...attach("WO-3"), information: "Plaster now bulging." }])),
      ...deps,
    });
    const boardBeforeApproval = await board.listWorkOrders();

    const approval = await approveProposal(entryId, deps);

    expect(approval).toMatchObject({
      outcome: "returned-to-review",
      conflicts: ["Work Order WO-3 changed on the Board since this Proposal was made."],
    });
    expect(await board.listWorkOrders()).toEqual(boardBeforeApproval);
    expect(await reviewQueue.get(entryId)).toMatchObject({
      status: "pending",
      conflicts: ["Work Order WO-3 changed on the Board since this Proposal was made."],
    });

    // Back in review, the Coordinator has now seen the Work Order as it is, and approves again.
    const second = await approveProposal(entryId, deps);

    expect(second.outcome).toBe("applied");
    expect(await board.getWorkOrder("WO-3")).toMatchObject({ messageIds: ["msg-0c", "msg-sam", "msg-maya"] });
  });

  it("returns a Proposal to review when its Work Order was closed, until a Coordinator edits it", async () => {
    const { entryId, deps, board } = await queued(
      crossTenantReport,
      proposalOf([attach("WO-3", "cross-tenant")]),
      new FakeBoard([samCeilingLeak]),
    );
    await board.closeWorkOrder("WO-3");

    const approval = await approveProposal(entryId, deps);

    expect(approval).toMatchObject({
      outcome: "returned-to-review",
      conflicts: ["Operation 1 attaches to Work Order WO-3, which is closed."],
      entry: { status: "pending" },
    });
    // Approving again still won't add to closed work.
    expect((await approveProposal(entryId, deps)).outcome).toBe("returned-to-review");
    expect(await board.listWorkOrders()).toEqual([{ ...samCeilingLeak, status: "closed" }]);

    // The leak is back: the Coordinator turns the attach into a new Work Order and approves it.
    await editProposal(entryId, proposalOf([create({ type: "unit", unitId: "harbor-view-1a" }, "urgent")]), deps);
    const fixed = await approveProposal(entryId, deps);

    expect(fixed).toMatchObject({ outcome: "applied", entry: { status: "approved" } });
    expect(await board.listWorkOrders()).toMatchObject([
      { id: "WO-3", status: "closed", messageIds: ["msg-0c"] },
      { id: "WO-4", location: { type: "unit", unitId: "harbor-view-1a" }, messageIds: ["msg-maya"] },
    ]);
  });

  it("returns a Proposal to review when its Work Order is no longer on the Board", async () => {
    const { entryId, deps, reviewQueue } = await queued(
      crossTenantReport,
      proposalOf([attach("WO-3", "cross-tenant")]),
      new FakeBoard([samCeilingLeak]),
    );
    // The Board the Coordinator approves against no longer has the Work Order.
    const emptied = { ...deps, board: new FakeBoard() };

    const approval = await approveProposal(entryId, emptied);

    expect(approval.outcome).toBe("returned-to-review");
    expect(await emptied.board.listWorkOrders()).toEqual([]);
    expect(await reviewQueue.get(entryId)).toMatchObject({ status: "pending" });
  });

  it("checks an attach the Coordinator added by editing against the Board as it was when they edited", async () => {
    const { entryId, deps, board } = await queued(
      crossTenantReport,
      proposalOf([create({ type: "unit", unitId: "harbor-view-2a" })], true),
      new FakeBoard([samCeilingLeak]),
    );
    await editProposal(entryId, proposalOf([attach("WO-3", "cross-tenant")]), deps);
    await board.appendToWorkOrder("WO-3", { information: "Plumber booked.", messageId: "msg-other" });

    expect((await approveProposal(entryId, deps)).outcome).toBe("returned-to-review");
  });
});

describe("rejecting a Proposal", () => {
  it("leaves the Board untouched and records the Coordinator's reason", async () => {
    const { entryId, deps, board, reviewQueue } = await queued(
      messageFrom(STRANGER, "I'm in 2A, the towel rail is loose."),
      proposalOf([create({ type: "unit", unitId: "harbor-view-2a" })]),
      new FakeBoard([mayaTap]),
    );

    const rejected = await rejectProposal(entryId, deps, "  Not a Tenant: already confirmed with Maya.  ");

    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Not a Tenant: already confirmed with Maya." });
    expect(await board.listWorkOrders()).toEqual([mayaTap]);
    expect(await reviewQueue.list()).toEqual([rejected]);
  });
});
