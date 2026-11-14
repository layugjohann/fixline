import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { runIntake } from "@/intake";

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
function scriptedModel(senderEmail: string, proposal: Proposal) {
  return new MockLanguageModelV4({
    doGenerate: [
      toolCallTurn("call-1", "lookUpSender", { email: senderEmail }),
      toolCallTurn("call-2", "submitProposal", proposal),
    ],
  });
}

const message: Message = {
  id: "msg-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body: "The kitchen sink tap is dripping and there's a puddle under the cabinet.",
};

const createProposal: Proposal = {
  classification: "maintenance",
  operations: [
    {
      type: "create",
      unitId: "harbor-view-2a",
      title: "Dripping kitchen sink tap",
      description: "Kitchen sink tap drips constantly; small puddle under the cabinet each morning.",
      trade: "plumbing",
      urgency: "urgent",
    },
  ],
  reasoning: "Known Tenant in Unit 2A reports one plumbing problem.",
};

describe("Intake", () => {
  it("applies a scripted create Proposal as a new Work Order on the Board", async () => {
    const board = new FakeBoard();

    const result = await runIntake(message, {
      model: scriptedModel(message.sender.email, createProposal),
      board,
      propertyRoster,
    });

    expect(result.proposal).toEqual(createProposal);
    expect(result.routing.outcome).toBe("auto-apply");
    expect(await board.listWorkOrders()).toEqual([
      {
        id: "WO-1",
        unitId: "harbor-view-2a",
        title: "Dripping kitchen sink tap",
        description: "Kitchen sink tap drips constantly; small puddle under the cabinet each morning.",
        trade: "plumbing",
        urgency: "urgent",
        status: "open",
        messageIds: ["msg-1"],
      },
    ]);
  });

  it("adds the new Work Order alongside those already on the Board", async () => {
    const board = new FakeBoard([
      {
        id: "WO-1",
        unitId: "quay-court-101",
        title: "Broken window latch",
        description: "Bedroom window latch won't close.",
        trade: "carpentry",
        urgency: "routine",
        status: "open",
        messageIds: ["msg-0"],
      },
    ]);

    await runIntake(message, {
      model: scriptedModel(message.sender.email, createProposal),
      board,
      propertyRoster,
    });

    const workOrders = await board.listWorkOrders();
    expect(workOrders).toHaveLength(2);
    expect(workOrders[1]).toMatchObject({ id: "WO-2", unitId: "harbor-view-2a", messageIds: ["msg-1"] });
  });

  it("returns a serialisable trace that ends with the Proposal and routing decision", async () => {
    const result = await runIntake(message, {
      model: scriptedModel(message.sender.email, createProposal),
      board: new FakeBoard(),
      propertyRoster,
    });

    const trace = JSON.parse(JSON.stringify(result.trace));
    expect(trace).toEqual(result.trace);
    expect(trace.messageId).toBe("msg-1");
    expect(trace.steps).toContainEqual({ type: "proposal", proposal: createProposal });
    expect(trace.steps).toContainEqual({ type: "routing", decision: result.routing });
  });
});
