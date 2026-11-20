/**
 * Placing problems from Senders who aren't in the Property Roster (Issue 17): the agent lists the
 * Properties, places a problem only in a Unit or Common Area the Message names exactly, and
 * otherwise asks for the Location. Exercised through the Intake entry point with a mock model.
 */
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal, WorkOrderLocation } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { InvalidProposalError, runIntake } from "@/intake";
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

/** A mock model that looks up the Sender, lists the Properties, then submits the given Proposal. */
function scriptedModel(message: Message, proposal: Proposal) {
  return new MockLanguageModelV4({
    doGenerate: [
      toolCallTurn("call-1", "lookUpSender", { email: message.sender.email }),
      toolCallTurn("call-2", "listProperties", {}),
      toolCallTurn("call-3", "submitProposal", proposal),
    ],
  });
}

async function intake(message: Message, proposal: Proposal) {
  const board = new FakeBoard();
  const reviewQueue = new InMemoryReviewQueue();
  const result = await runIntake(message, { model: scriptedModel(message, proposal), board, propertyRoster, reviewQueue });
  return { result, board, reviewQueue };
}

const STRANGER = { email: "dan.courier@example.net", name: "Dan" }; // not in the Property Roster

function messageFrom(body: string): Message {
  return { id: "msg-1", sender: STRANGER, receivedAt: "2026-11-21T17:00:00Z", body };
}

function createIn(location: WorkOrderLocation, urgency: "emergency" | "urgent" | "routine"): Proposal {
  return {
    classification: "maintenance",
    operations: [
      { type: "create", location, title: "Problem", description: "Described problem.", trade: "plumbing", urgency },
    ],
    uncertain: false,
    draftReplies: [],
    reasoning: "Unknown Sender; the Message names the Location.",
  };
}

const askForLocation: Proposal = {
  classification: "maintenance",
  operations: [],
  uncertain: true,
  draftReplies: [
    {
      purpose: "missing-unit",
      body: "Thanks for letting us know. Which building and flat is this in? Harbor Lane Property Management",
    },
  ],
  reasoning: "Unknown Sender, and the Message doesn't name one Unit or Common Area on the roster.",
};

describe("Unknown Senders", () => {
  it("lets the agent list every Property with its Units and Common Areas, and no Tenant data", async () => {
    const message = messageFrom("I'm in 2A at Harbor View Apartments, the towel rail is loose.");
    const { result } = await intake(message, createIn({ type: "unit", unitId: "harbor-view-2a" }, "routine"));

    const listing = result.trace.steps.find((step) => step.type === "tool-call" && step.toolName === "listProperties");
    expect(listing).toBeDefined();
    const output = (listing as { output: unknown }).output;
    expect(output).toEqual({
      properties: propertyRoster.properties.map((property) => ({
        id: property.id,
        name: property.name,
        address: property.address,
        units: property.units.map(({ id, label }) => ({ id, label })),
        commonAreas: property.commonAreas.map(({ id, name }) => ({ id, name })),
      })),
    });
    const serialised = JSON.stringify(output);
    for (const tenant of propertyRoster.tenants) {
      expect(serialised).not.toContain(tenant.id);
      expect(serialised).not.toContain(tenant.name);
      expect(serialised).not.toContain(tenant.email);
    }
  });

  it("creates a problem in the Unit the Message names, sent for review and not flagged uncertain", async () => {
    const proposal = createIn({ type: "unit", unitId: "harbor-view-2a" }, "routine");
    const { result, board, reviewQueue } = await intake(
      messageFrom("I'm in 2A at Harbor View Apartments, the towel rail is loose. No rush."),
      proposal,
    );

    expect(result.proposal).toEqual(proposal);
    expect(result.routing).toMatchObject({ outcome: "review", rules: ["unknown-sender"] });
    expect(await board.listWorkOrders()).toEqual([]);
    expect(await reviewQueue.list()).toMatchObject([{ status: "pending", proposal }]);
  });

  it("applies an emergency in a named Common Area at once and flags it as from an unknown Sender", async () => {
    const lobby: WorkOrderLocation = { type: "common-area", commonAreaId: "quay-court-lobby" };
    const { result, board, reviewQueue } = await intake(
      messageFrom("Water is pouring through the lobby ceiling at Quay Court!"),
      createIn(lobby, "emergency"),
    );

    expect(result.routing).toMatchObject({ outcome: "apply-and-flag", rules: ["emergency", "unknown-sender"] });
    const workOrders = await board.listWorkOrders();
    expect(workOrders).toHaveLength(1);
    expect(workOrders[0]).toMatchObject({ location: lobby, urgency: "emergency", messageIds: ["msg-1"] });
    // An unknown Sender raised it, so no Tenant is recorded.
    expect(workOrders[0]!.raisedByTenantId).toBeUndefined();
    expect(await reviewQueue.list()).toMatchObject([{ status: "flagged" }]);
  });

  it.each([
    ["names no Location", "The radiator in my bedroom is stone cold."],
    ["names a Unit that doesn't exist", "I'm in 4C at Harbor View, the radiator is stone cold."],
    ["names a Unit without its Property", "I'm in 2A, the radiator is stone cold."],
    ["names a Common Area more than one Property has", "The light in the lobby is flickering."],
  ])("creates nothing and asks for the Location when the Message %s", async (_case, body) => {
    const { result, board, reviewQueue } = await intake(messageFrom(body), askForLocation);

    expect(result.routing).toMatchObject({ outcome: "review", rules: ["uncertain", "unknown-sender", "draft-reply"] });
    expect(await board.listWorkOrders()).toEqual([]);
    expect(await reviewQueue.list()).toMatchObject([
      { status: "pending", proposal: { operations: [], draftReplies: [{ purpose: "missing-unit" }] } },
    ]);
  });

  it("rejects a guessed Unit id that isn't on the roster before it reaches the Board or the Review Queue", async () => {
    const board = new FakeBoard();
    const reviewQueue = new InMemoryReviewQueue();
    const message = messageFrom("I'm in 4C at Harbor View, the radiator is stone cold.");
    const guessed = createIn({ type: "unit", unitId: "harbor-view-4c" }, "urgent");

    await expect(
      runIntake(message, { model: scriptedModel(message, guessed), board, propertyRoster, reviewQueue }),
    ).rejects.toBeInstanceOf(InvalidProposalError);
    expect(await board.listWorkOrders()).toEqual([]);
    expect(await reviewQueue.list()).toEqual([]);
  });
});
