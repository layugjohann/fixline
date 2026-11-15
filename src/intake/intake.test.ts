import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import type { Message, Proposal, WorkOrder } from "@/domain";
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

  describe("matching existing Work Orders", () => {
    const windowLatch: WorkOrder = {
      id: "WO-1",
      unitId: "quay-court-101",
      title: "Broken window latch",
      description: "Bedroom window latch won't close.",
      trade: "carpentry",
      urgency: "routine",
      status: "open",
      messageIds: ["msg-0"],
    };
    const kitchenTap: WorkOrder = {
      id: "WO-2",
      unitId: "harbor-view-2a",
      title: "Dripping kitchen sink tap",
      description: "Kitchen sink tap drips constantly.",
      trade: "plumbing",
      urgency: "urgent",
      status: "open",
      messageIds: ["msg-0b"],
    };
    const oldBoiler: WorkOrder = {
      id: "WO-3",
      unitId: "harbor-view-2a",
      title: "Boiler pressure low",
      description: "Boiler kept losing pressure.",
      trade: "hvac",
      urgency: "urgent",
      status: "closed",
      messageIds: ["msg-0c"],
    };

    const followUp: Message = {
      id: "msg-2",
      sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
      receivedAt: "2026-11-16T08:00:00Z",
      body: "The kitchen tap is STILL dripping!! It's been days. Now it's coming from the base too.",
    };

    const attachProposal: Proposal = {
      classification: "maintenance",
      operations: [
        { type: "attach", workOrderId: "WO-2", information: "Still dripping after several days; now leaks from the base." },
      ],
      reasoning: "Follow-up from the same Tenant about the open kitchen tap Work Order.",
    };

    /** Looks up the Sender, searches the Board, reads one Work Order, then submits the Proposal. */
    function matchingModel(proposal: Proposal) {
      return new MockLanguageModelV4({
        doGenerate: [
          toolCallTurn("call-1", "lookUpSender", { email: followUp.sender.email }),
          toolCallTurn("call-2", "searchOpenWorkOrders", { unitId: "harbor-view-2a" }),
          toolCallTurn("call-3", "getWorkOrder", { workOrderId: "WO-2" }),
          toolCallTurn("call-4", "submitProposal", proposal),
        ],
      });
    }

    it("attaches the Message to the matched Work Order instead of creating a duplicate", async () => {
      const board = new FakeBoard([windowLatch, kitchenTap, oldBoiler]);

      const result = await runIntake(followUp, { model: matchingModel(attachProposal), board, propertyRoster });

      expect(result.proposal).toEqual(attachProposal);
      expect(result.routing.outcome).toBe("auto-apply");
      expect(result.createdWorkOrders).toEqual([]);
      const updated = {
        ...kitchenTap,
        description:
          "Kitchen sink tap drips constantly.\n\n" +
          "Update from Message msg-2: Still dripping after several days; now leaks from the base.",
        messageIds: ["msg-0b", "msg-2"],
      };
      expect(result.updatedWorkOrders).toEqual([updated]);
      expect(await board.listWorkOrders()).toEqual([windowLatch, updated, oldBoiler]);
    });

    it("lets the agent search only open Work Orders and read a single Work Order", async () => {
      const board = new FakeBoard([windowLatch, kitchenTap, oldBoiler]);

      const result = await runIntake(followUp, { model: matchingModel(attachProposal), board, propertyRoster });

      const toolCalls = result.trace.steps.filter((step) => step.type === "tool-call");
      expect(toolCalls).toContainEqual({
        type: "tool-call",
        toolName: "searchOpenWorkOrders",
        input: { unitId: "harbor-view-2a" },
        output: [kitchenTap],
      });
      expect(toolCalls).toContainEqual({
        type: "tool-call",
        toolName: "getWorkOrder",
        input: { workOrderId: "WO-2" },
        output: { found: true, workOrder: kitchenTap },
      });
    });

    it("finds open Work Orders by words in their title or description", async () => {
      const model = new MockLanguageModelV4({
        doGenerate: [
          toolCallTurn("call-1", "searchOpenWorkOrders", { query: "dripping TAP" }),
          toolCallTurn("call-2", "searchOpenWorkOrders", { query: "boiler" }),
          toolCallTurn("call-3", "submitProposal", attachProposal),
        ],
      });

      const result = await runIntake(followUp, {
        model,
        board: new FakeBoard([windowLatch, kitchenTap, oldBoiler]),
        propertyRoster,
      });

      const outputs = result.trace.steps.flatMap((step) =>
        step.type === "tool-call" && step.toolName === "searchOpenWorkOrders" ? [step.output] : [],
      );
      expect(outputs).toContainEqual([kitchenTap]);
      // The boiler Work Order is closed, so it is never offered as a match.
      expect(outputs).toContainEqual([]);
    });
  });
});
