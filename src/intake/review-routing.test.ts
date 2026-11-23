/**
 * Every review-policy rule from ADR 0003, exercised through the Intake entry
 * point with a scripted mock model, plus a Coordinator working the Review Queue.
 */
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { DraftReply, Message, Proposal, Trade, WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  ReviewQueueEntryNotResolvableError,
  acknowledgeEmergency,
  approveProposal,
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

/** A mock model scripted to look up the Sender, then submit the given Proposal. */
function scriptedModel(message: Message, proposal: Proposal) {
  return new MockLanguageModelV4({
    doGenerate: [
      toolCallTurn("call-1", "lookUpSender", { email: message.sender.email }),
      toolCallTurn("call-2", "submitProposal", proposal),
    ],
  });
}

/** Runs one Message through Intake against the given Board, with a fresh Review Queue. */
async function intake(message: Message, proposal: Proposal, board: FakeBoard = new FakeBoard()) {
  const reviewQueue = new InMemoryReviewQueue();
  const result = await runIntake(message, {
    model: scriptedModel(message, proposal),
    board,
    propertyRoster,
    reviewQueue,
  });
  return { result, board, reviewQueue, deps: { board, propertyRoster, reviewQueue } };
}

const MAYA = { email: "maya.okafor@example.com", name: "Maya Okafor" }; // Harbor View 2A
const LUIS = { email: "luis.romero@example.com", name: "Luis Romero" }; // Harbor View 3B
const STRANGER = { email: "m.okafor.home@example.org", name: "Maya O." }; // not in the Property Roster

function messageFrom(sender: Message["sender"], body: string, id = "msg-1"): Message {
  return { id, sender, receivedAt: "2026-11-16T09:00:00Z", body };
}

function createIn(
  unitId: string,
  urgency: "emergency" | "urgent" | "routine",
  uncertain = false,
  trade: Trade = "plumbing",
): Proposal {
  return {
    classification: "maintenance",
    operations: [
      {
        type: "create",
        location: { type: "unit", unitId },
        title: "Problem",
        description: "Described problem.",
        trade,
        urgency,
      },
    ],
    uncertain,
    draftReplies: [],
    reasoning: "Scripted.",
  };
}

function attachTo(workOrderId: string, matchType: "same-tenant" | "cross-tenant"): Proposal {
  return {
    classification: "maintenance",
    operations: [{ type: "attach", workOrderId, matchType, information: "More detail." }],
    uncertain: false,
    draftReplies: [],
    reasoning: "Scripted.",
  };
}

/** One Proposal holding the operations of several, labelled like the first. */
function withOperations(first: Proposal, ...rest: Proposal[]): Proposal {
  return { ...first, operations: [first, ...rest].flatMap((proposal) => proposal.operations) };
}

/** A leak through Sam's (1A) bathroom ceiling, raised by Sam. */
const samCeilingLeak: WorkOrder = {
  id: "WO-1",
  location: { type: "unit", unitId: "harbor-view-1a" },
  title: "Water leaking through bathroom ceiling",
  description: "Water drips through the bathroom ceiling, probably from the flat above.",
  trade: "plumbing",
  urgency: "urgent",
  status: "open",
  messageIds: ["msg-0"],
  raisedByTenantId: "tenant-sam",
};

/** Maya's own dripping tap, raised by Maya. */
const mayaTap: WorkOrder = {
  id: "WO-2",
  location: { type: "unit", unitId: "harbor-view-2a" },
  title: "Dripping kitchen tap",
  description: "Kitchen tap drips.",
  trade: "plumbing",
  urgency: "routine",
  status: "open",
  messageIds: ["msg-0b"],
  raisedByTenantId: "tenant-maya",
};

describe("review policy", () => {
  describe("auto-apply", () => {
    it("applies a clear new routine Work Order from a known Tenant without review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(LUIS, "The wardrobe door sticks, no rush."),
        createIn("harbor-view-3b", "routine"),
      );

      expect(result.routing).toMatchObject({ outcome: "auto-apply", rules: [] });
      expect(await board.listWorkOrders()).toMatchObject([
        { id: "WO-1", urgency: "routine", raisedByTenantId: "tenant-luis", messageIds: ["msg-1"] },
      ]);
      expect(await reviewQueue.list()).toEqual([]);
      expect(result.reviewQueueEntries).toEqual([]);
    });

    it("applies a clear new urgent Work Order without review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(MAYA, "No hot water since last night."),
        createIn("harbor-view-2a", "urgent"),
      );

      expect(result.routing.outcome).toBe("auto-apply");
      expect(await board.listWorkOrders()).toHaveLength(1);
      expect(await reviewQueue.list()).toEqual([]);
    });

    it("applies an obvious match to a Work Order the same Tenant raised", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(MAYA, "The kitchen tap is STILL dripping!!"),
        attachTo("WO-2", "same-tenant"),
        new FakeBoard([mayaTap]),
      );

      expect(result.routing).toMatchObject({ outcome: "auto-apply", rules: [] });
      expect((await board.getWorkOrder("WO-2"))!.messageIds).toEqual(["msg-0b", "msg-1"]);
      expect(await reviewQueue.list()).toEqual([]);
    });
  });

  describe("sent to the Review Queue", () => {
    it("sends a Proposal the agent flagged uncertain to review, leaving the Board untouched", async () => {
      const message = messageFrom(LUIS, "Knocking noise somewhere at night, pipes or neighbours?");
      const proposal = createIn("harbor-view-3b", "routine", true);

      const { result, board, reviewQueue } = await intake(message, proposal);

      expect(result.routing).toMatchObject({ outcome: "review", rules: ["uncertain"] });
      expect(result.routing.reason).toContain("uncertain");
      expect(result.createdWorkOrders).toEqual([]);
      expect(await board.listWorkOrders()).toEqual([]);
      expect(await reviewQueue.list()).toEqual([
        { id: "RQ-1", message, proposal, routing: result.routing, status: "pending", attachTargets: [] },
      ]);
      expect(result.reviewQueueEntries).toEqual(await reviewQueue.list());
    });

    it("sends the Unit above's report of a ceiling leak raised by the Unit below to review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(MAYA, "Sam downstairs says water is coming through his ceiling from my flat."),
        attachTo("WO-1", "cross-tenant"),
        new FakeBoard([samCeilingLeak]),
      );

      expect(result.routing).toMatchObject({ outcome: "review", rules: ["cross-tenant-match"] });
      expect(await board.listWorkOrders()).toEqual([samCeilingLeak]);
      expect(await reviewQueue.list()).toMatchObject([{ status: "pending", routing: { rules: ["cross-tenant-match"] } }]);
    });

    it("sends a cross-Tenant match to review even when the agent labels it same-Tenant", async () => {
      const { result, board } = await intake(
        messageFrom(MAYA, "Sam downstairs says water is coming through his ceiling from my flat."),
        attachTo("WO-1", "same-tenant"),
        new FakeBoard([samCeilingLeak]),
      );

      expect(result.routing).toMatchObject({ outcome: "review", rules: ["cross-tenant-match"] });
      expect(await board.listWorkOrders()).toEqual([samCeilingLeak]);
    });

    it("sends a Message from a Sender not in the Property Roster to review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(STRANGER, "I'm in 2A, the towel rail has come loose. No rush."),
        createIn("harbor-view-2a", "routine"),
      );

      expect(result.routing).toMatchObject({ outcome: "review", rules: ["unknown-sender"] });
      expect(await board.listWorkOrders()).toEqual([]);
      expect(await reviewQueue.list()).toMatchObject([{ status: "pending" }]);
    });

    it("sends even a non-maintenance Message from an unknown Sender to review", async () => {
      const { result, reviewQueue } = await intake(messageFrom(STRANGER, "Boost your listings! Reply YES."), {
        classification: "not-maintenance",
        operations: [],
        uncertain: false,
        draftReplies: [],
        reasoning: "Marketing spam.",
      });

      expect(result.routing).toMatchObject({ outcome: "review", rules: ["unknown-sender"] });
      expect(await reviewQueue.list()).toHaveLength(1);
    });

    it("names every rule that sent a Proposal to review", async () => {
      const { result } = await intake(
        messageFrom(STRANGER, "Water coming through the ceiling of 1A, I think."),
        { ...attachTo("WO-1", "cross-tenant"), uncertain: true },
        new FakeBoard([samCeilingLeak]),
      );

      expect(result.routing.outcome).toBe("review");
      expect(result.routing.rules).toEqual(["uncertain", "cross-tenant-match", "unknown-sender"]);
    });
  });

  describe("emergencies", () => {
    it("puts an emergency on the Board immediately and flags it to a Coordinator", async () => {
      const message = messageFrom(MAYA, "The pipe under my sink burst, water everywhere!");
      const proposal = createIn("harbor-view-2a", "emergency");

      const { result, board, reviewQueue } = await intake(message, proposal);

      expect(result.routing).toMatchObject({ outcome: "apply-and-flag", rules: ["emergency"] });
      expect(await board.listWorkOrders()).toMatchObject([{ id: "WO-1", urgency: "emergency", status: "open" }]);
      expect(result.createdWorkOrders).toMatchObject([{ id: "WO-1" }]);
      expect(await reviewQueue.list()).toEqual([
        { id: "RQ-1", message, proposal, routing: result.routing, status: "flagged", attachTargets: [] },
      ]);
    });

    it("applies an emergency from an unknown Sender immediately too, flagging every rule it triggered", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(STRANGER, "Burst pipe in 2A, flooding!"),
        createIn("harbor-view-2a", "emergency", true),
      );

      expect(result.routing).toMatchObject({
        outcome: "apply-and-flag",
        rules: ["emergency", "uncertain", "unknown-sender"],
      });
      expect(await board.listWorkOrders()).toHaveLength(1);
      expect(await reviewQueue.list()).toMatchObject([{ status: "flagged" }]);
    });

    it("lets a Coordinator acknowledge a flagged emergency, which is already on the Board", async () => {
      const { result, board, deps } = await intake(
        messageFrom(MAYA, "The pipe under my sink burst, water everywhere!"),
        createIn("harbor-view-2a", "emergency"),
      );
      const before = await board.listWorkOrders();

      const entry = await acknowledgeEmergency(result.reviewQueueEntries[0]!.id, deps);

      expect(entry.status).toBe("acknowledged");
      expect(await board.listWorkOrders()).toEqual(before);
      await expect(approveProposal(entry.id, deps)).rejects.toBeInstanceOf(ReviewQueueEntryNotResolvableError);
    });

    it("applies an emergency alongside clear routine changes whole, and flags it", async () => {
      const proposal = withOperations(
        createIn("harbor-view-2a", "emergency"),
        createIn("harbor-view-2a", "routine", false, "carpentry"),
      );

      const { result, board, reviewQueue } = await intake(
        messageFrom(MAYA, "Pipe burst under the sink! Also the wardrobe door sticks."),
        proposal,
      );

      expect(result.routing).toMatchObject({ outcome: "apply-and-flag", rules: ["emergency"] });
      expect(await board.listWorkOrders()).toMatchObject([{ urgency: "emergency" }, { urgency: "routine" }]);
      expect(await reviewQueue.list()).toMatchObject([{ status: "flagged", proposal }]);
    });
  });

  describe("an emergency plus a review trigger is split (ADR 0003)", () => {
    it("applies only the emergency and sends a cross-Tenant match to review", async () => {
      const message = messageFrom(MAYA, "My bathroom pipe burst! Also Sam says water is coming through his ceiling.");
      const emergency = createIn("harbor-view-2a", "emergency");
      const proposal = withOperations(emergency, attachTo("WO-1", "cross-tenant"));

      const { result, board, reviewQueue } = await intake(message, proposal, new FakeBoard([samCeilingLeak]));

      expect(result.routing).toMatchObject({ outcome: "split", rules: ["emergency", "cross-tenant-match"] });
      expect(result.createdWorkOrders).toMatchObject([{ id: "WO-2", urgency: "emergency" }]);
      expect(result.updatedWorkOrders).toEqual([]);
      // Sam's Work Order is untouched until a Coordinator approves the match.
      expect(await board.getWorkOrder("WO-1")).toEqual(samCeilingLeak);
      expect(await reviewQueue.list()).toEqual([
        {
          id: "RQ-1",
          message,
          proposal: emergency,
          routing: { outcome: "apply-and-flag", rules: ["emergency"], reason: expect.any(String) },
          status: "flagged",
          attachTargets: [],
        },
        {
          id: "RQ-2",
          message,
          proposal: { ...proposal, operations: [proposal.operations[1]] },
          routing: { outcome: "review", rules: ["cross-tenant-match"], reason: expect.any(String) },
          status: "pending",
          // Sam's Work Order as it was when queued, so approving can tell if it changed meanwhile.
          attachTargets: [samCeilingLeak],
        },
      ]);
      expect(result.reviewQueueEntries).toEqual(await reviewQueue.list());
    });

    it("applies only the emergency from a Sender not in the Property Roster, and sends the rest to review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(STRANGER, "Flooding in 2A from the sink! Also the window latch is loose."),
        withOperations(createIn("harbor-view-2a", "emergency"), createIn("harbor-view-2a", "routine", false, "carpentry")),
      );

      expect(result.routing).toMatchObject({ outcome: "split", rules: ["emergency", "unknown-sender"] });
      expect(await board.listWorkOrders()).toMatchObject([{ id: "WO-1", urgency: "emergency" }]);
      expect(await reviewQueue.list()).toMatchObject([
        { status: "flagged", routing: { outcome: "apply-and-flag", rules: ["emergency", "unknown-sender"] } },
        {
          status: "pending",
          routing: { outcome: "review", rules: ["unknown-sender"] },
          proposal: { operations: [{ type: "create", urgency: "routine" }] },
        },
      ]);
    });

    it("applies only the emergency from an uncertain Proposal, and sends the rest to review", async () => {
      const { result, board, reviewQueue } = await intake(
        messageFrom(LUIS, "Sparks from the socket! And maybe a knocking in the pipes?"),
        { ...withOperations(
          createIn("harbor-view-3b", "emergency", false, "electrical"),
          createIn("harbor-view-3b", "routine"),
        ),
        uncertain: true,
      },
      );

      expect(result.routing).toMatchObject({ outcome: "split", rules: ["emergency", "uncertain"] });
      expect(await board.listWorkOrders()).toMatchObject([{ urgency: "emergency" }]);
      expect(await reviewQueue.list()).toMatchObject([
        { status: "flagged", routing: { rules: ["emergency", "uncertain"] } },
        { status: "pending", routing: { outcome: "review", rules: ["uncertain"] } },
      ]);
    });

    it("lets a Coordinator approve the rest after the emergency is already on the Board", async () => {
      const { result, board, reviewQueue, deps } = await intake(
        messageFrom(MAYA, "My bathroom pipe burst! Also Sam says water is coming through his ceiling."),
        withOperations(createIn("harbor-view-2a", "emergency"), attachTo("WO-1", "cross-tenant")),
        new FakeBoard([samCeilingLeak]),
      );
      const [flagged, pending] = result.reviewQueueEntries;

      await approveProposal(pending!.id, deps);
      await acknowledgeEmergency(flagged!.id, deps);

      // The emergency was created once; approving the rest only attaches the match.
      expect(await board.listWorkOrders()).toMatchObject([
        { id: "WO-1", messageIds: ["msg-0", "msg-1"] },
        { id: "WO-2", urgency: "emergency", messageIds: ["msg-1"] },
      ]);
      expect(await reviewQueue.list()).toMatchObject([{ status: "acknowledged" }, { status: "approved" }]);
    });

    it("leaves the emergency on the Board when a Coordinator rejects the rest", async () => {
      const { result, board, deps } = await intake(
        messageFrom(STRANGER, "Flooding in 2A from the sink! Also the window latch is loose."),
        withOperations(createIn("harbor-view-2a", "emergency"), createIn("harbor-view-2a", "routine", false, "carpentry")),
      );

      await rejectProposal(result.reviewQueueEntries[1]!.id, deps);

      expect(await board.listWorkOrders()).toMatchObject([{ urgency: "emergency" }]);
    });
  });
});

describe("Review Queue", () => {
  it("applies a Proposal when a Coordinator approves it", async () => {
    const { result, board, reviewQueue, deps } = await intake(
      messageFrom(STRANGER, "I'm in 2A, the towel rail has come loose. No rush."),
      createIn("harbor-view-2a", "routine"),
    );

    const approved = await approveProposal(result.reviewQueueEntries[0]!.id, deps);

    expect(approved.entry.status).toBe("approved");
    if (approved.outcome !== "applied") throw new Error(`Expected the Proposal to be applied, got ${approved.outcome}.`);
    // An unknown Sender raised it, so no Tenant is recorded.
    expect(approved.createdWorkOrders).toEqual([
      {
        id: "WO-1",
        location: { type: "unit", unitId: "harbor-view-2a" },
        title: "Problem",
        description: "Described problem.",
        trade: "plumbing",
        urgency: "routine",
        status: "open",
        messageIds: ["msg-1"],
      },
    ]);
    expect(await board.listWorkOrders()).toEqual(approved.createdWorkOrders);
    expect(await reviewQueue.list()).toMatchObject([{ id: "RQ-1", status: "approved" }]);
  });

  it("attaches a cross-Tenant match once a Coordinator approves it", async () => {
    const { result, board, deps } = await intake(
      messageFrom(MAYA, "Sam downstairs says water is coming through his ceiling from my flat."),
      attachTo("WO-1", "cross-tenant"),
      new FakeBoard([samCeilingLeak]),
    );

    await approveProposal(result.reviewQueueEntries[0]!.id, deps);

    expect(await board.getWorkOrder("WO-1")).toMatchObject({
      messageIds: ["msg-0", "msg-1"],
      // Still Sam's Work Order.
      raisedByTenantId: "tenant-sam",
    });
  });

  it("leaves the Board untouched when a Coordinator rejects a Proposal, and keeps the rejection on record", async () => {
    const { result, board, reviewQueue, deps } = await intake(
      messageFrom(MAYA, "Sam downstairs says water is coming through his ceiling from my flat."),
      attachTo("WO-1", "cross-tenant"),
      new FakeBoard([samCeilingLeak]),
    );

    const rejected = await rejectProposal(result.reviewQueueEntries[0]!.id, deps);

    expect(rejected.status).toBe("rejected");
    expect(await board.listWorkOrders()).toEqual([samCeilingLeak]);
    expect(await reviewQueue.list()).toEqual([{ ...result.reviewQueueEntries[0]!, status: "rejected" }]);
  });

  it("won't approve or reject a Proposal a Coordinator has already decided", async () => {
    const { result, board, deps } = await intake(
      messageFrom(LUIS, "Knocking noise somewhere at night, pipes or neighbours?"),
      createIn("harbor-view-3b", "routine", true),
    );
    const id = result.reviewQueueEntries[0]!.id;
    await approveProposal(id, deps);

    await expect(approveProposal(id, deps)).rejects.toBeInstanceOf(ReviewQueueEntryNotResolvableError);
    await expect(rejectProposal(id, deps)).rejects.toBeInstanceOf(ReviewQueueEntryNotResolvableError);
    expect(await board.listWorkOrders()).toHaveLength(1);
  });

  it("keeps each Message's entry when several Proposals wait in the same Review Queue", async () => {
    const board = new FakeBoard([samCeilingLeak]);
    const reviewQueue = new InMemoryReviewQueue();
    const first = messageFrom(STRANGER, "Towel rail loose in 2A.", "msg-a");
    const second = messageFrom(MAYA, "Sam says water comes through his ceiling.", "msg-b");

    await runIntake(first, {
      model: scriptedModel(first, createIn("harbor-view-2a", "routine")),
      board,
      propertyRoster,
      reviewQueue,
    });
    await runIntake(second, {
      model: scriptedModel(second, attachTo("WO-1", "cross-tenant")),
      board,
      propertyRoster,
      reviewQueue,
    });

    expect(await reviewQueue.list()).toMatchObject([
      { id: "RQ-1", message: { id: "msg-a" }, routing: { rules: ["unknown-sender"] }, status: "pending" },
      { id: "RQ-2", message: { id: "msg-b" }, routing: { rules: ["cross-tenant-match"] }, status: "pending" },
    ]);
  });
});

describe("Draft Replies", () => {
  const askForUnit: DraftReply = {
    purpose: "missing-unit",
    body: "Hi, thanks for letting us know. Which building and flat number are you in? Harbor Lane Property Management",
  };
  const confirmUnit: DraftReply = {
    purpose: "unit-mismatch",
    body: "Hi Maya, our records show you in 2A, but your message mentions 3B. Could you confirm which flat has the problem?",
  };
  const confirmEmergency: DraftReply = {
    purpose: "emergency-confirmation",
    body: "Hi Maya, we've received your report and a plumber is being arranged today. Please keep the water off.",
  };

  function withReplies(proposal: Proposal, ...draftReplies: DraftReply[]): Proposal {
    return { ...proposal, draftReplies };
  }

  it("always routes a Proposal with a Draft Reply to review, whatever else it holds", async () => {
    const senders = [MAYA, STRANGER];
    const proposals = [
      createIn("harbor-view-2a", "routine"),
      createIn("harbor-view-2a", "urgent"),
      createIn("harbor-view-2a", "routine", true),
      createIn("harbor-view-2a", "emergency"),
      createIn("harbor-view-2a", "emergency", true),
      withOperations(createIn("harbor-view-2a", "emergency"), createIn("harbor-view-2a", "routine")),
      attachTo("WO-2", "same-tenant"),
      { classification: "maintenance", operations: [], uncertain: false, draftReplies: [], reasoning: "Scripted." },
      { classification: "not-maintenance", operations: [], uncertain: false, draftReplies: [], reasoning: "Scripted." },
    ] satisfies Proposal[];

    for (const sender of senders) {
      for (const proposal of proposals) {
        const { result, reviewQueue } = await intake(
          messageFrom(sender, "Something is wrong in my flat."),
          withReplies(proposal, askForUnit),
          new FakeBoard([mayaTap]),
        );

        expect(["review", "split"]).toContain(result.routing.outcome);
        expect(result.routing.rules).toContain("draft-reply");
        const entries = await reviewQueue.list();
        // The Draft Reply waits in exactly one pending entry, never in a flagged (already applied) one.
        expect(entries.filter((entry) => entry.proposal.draftReplies.length > 0)).toMatchObject([
          { status: "pending", proposal: { draftReplies: [askForUnit] }, routing: { outcome: "review" } },
        ]);
        expect(entries.every((entry) => entry.draftRepliesSentAt === undefined)).toBe(true);
      }
    }
  });

  it("sends a clear routine Work Order with a Draft Reply to review instead of applying it", async () => {
    const { result, board, reviewQueue } = await intake(
      messageFrom(MAYA, "Hi, I'm in 3B and the wardrobe door sticks."),
      withReplies(createIn("harbor-view-2a", "routine"), confirmUnit),
    );

    expect(result.routing).toMatchObject({ outcome: "review", rules: ["draft-reply"] });
    expect(result.routing.reason).toContain("Draft Reply");
    expect(await board.listWorkOrders()).toEqual([]);
    expect(await reviewQueue.list()).toMatchObject([{ status: "pending", proposal: { draftReplies: [confirmUnit] } }]);
  });

  it("sends a Proposal that only asks the Sender for their Unit to review", async () => {
    const { result, board } = await intake(messageFrom(STRANGER, "The radiator in my bedroom is cold."), {
      classification: "maintenance",
      operations: [],
      uncertain: true,
      draftReplies: [askForUnit],
      reasoning: "Unknown Sender, no Unit given.",
    });

    expect(result.routing).toMatchObject({ outcome: "review", rules: ["uncertain", "unknown-sender", "draft-reply"] });
    expect(await board.listWorkOrders()).toEqual([]);
  });

  it("applies an emergency at once and sends its Draft Reply to review (ADR 0003)", async () => {
    const message = messageFrom(MAYA, "Pipe burst under the sink! Can someone confirm a plumber is coming?");
    const emergency = createIn("harbor-view-2a", "emergency");

    const { result, board, reviewQueue } = await intake(message, withReplies(emergency, confirmEmergency));

    expect(result.routing).toMatchObject({ outcome: "split", rules: ["emergency", "draft-reply"] });
    expect(await board.listWorkOrders()).toMatchObject([{ id: "WO-1", urgency: "emergency" }]);
    expect(await reviewQueue.list()).toEqual([
      {
        id: "RQ-1",
        message,
        proposal: emergency,
        routing: { outcome: "apply-and-flag", rules: ["emergency"], reason: expect.any(String) },
        status: "flagged",
        attachTargets: [],
      },
      {
        id: "RQ-2",
        message,
        proposal: { ...emergency, operations: [], draftReplies: [confirmEmergency] },
        routing: { outcome: "review", rules: ["draft-reply"], reason: expect.any(String) },
        status: "pending",
        attachTargets: [],
      },
    ]);
  });

  it("marks Draft Replies as sent only when a Coordinator approves them", async () => {
    const { result, board, reviewQueue, deps } = await intake(
      messageFrom(MAYA, "Hi, I'm in 3B and the wardrobe door sticks."),
      withReplies(createIn("harbor-view-2a", "routine"), confirmUnit),
    );
    const id = result.reviewQueueEntries[0]!.id;
    expect((await reviewQueue.get(id))!.draftRepliesSentAt).toBeUndefined();

    const approved = await approveProposal(id, deps, new Date("2026-11-16T10:00:00Z"));

    expect(approved.entry).toMatchObject({ status: "approved", draftRepliesSentAt: "2026-11-16T10:00:00.000Z" });
    expect(await reviewQueue.get(id)).toMatchObject({ draftRepliesSentAt: "2026-11-16T10:00:00.000Z" });
    expect(await board.listWorkOrders()).toMatchObject([{ id: "WO-1", urgency: "routine" }]);
  });

  it("never marks a rejected Draft Reply as sent", async () => {
    const { result, reviewQueue, deps } = await intake(messageFrom(STRANGER, "The radiator in my bedroom is cold."), {
      classification: "maintenance",
      operations: [],
      uncertain: false,
      draftReplies: [askForUnit],
      reasoning: "Unknown Sender, no Unit given.",
    });

    const rejected = await rejectProposal(result.reviewQueueEntries[0]!.id, deps);

    expect(rejected.status).toBe("rejected");
    expect((await reviewQueue.list())[0]!.draftRepliesSentAt).toBeUndefined();
  });

  it("records no sent time when a Coordinator approves a Proposal without Draft Replies", async () => {
    const { result, deps } = await intake(
      messageFrom(STRANGER, "I'm in 2A, the towel rail has come loose. No rush."),
      createIn("harbor-view-2a", "routine"),
    );

    const approved = await approveProposal(result.reviewQueueEntries[0]!.id, deps);

    expect(approved.entry.draftRepliesSentAt).toBeUndefined();
  });
});
