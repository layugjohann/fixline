/**
 * The possible-duplicate review rule (Issue 19, ADR 0003): a create with the same Location and
 * Trade as an open Work Order on the Board, or as another create in the same Proposal, waits in
 * the Review Queue instead of reaching the Board unchecked.
 */
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { FakeBoard } from "@/board";
import {
  TraceSchema,
  type CreateWorkOrderOperation,
  type Message,
  type Proposal,
  type Trace,
  type WorkOrder,
  type WorkOrderLocation,
} from "@/domain";
import { goldenScenarios } from "@/evals/golden-scenarios";
import { propertyRoster } from "@/fixtures";
import { runIntake } from "@/intake";
import { InMemoryReviewQueue } from "@/review-queue";
import qwenCommonAreaMerge from "../../eval-runs/qwen/traces/common-area-merge-across-units.json";
import gptOssAttachAndCreate from "../../eval-runs/gpt-oss-120b/traces/multi-problem-attach-and-create.json";
import { decideRouting, splitEmergency, type RoutingContext } from "./review-policy";

/** The Proposal a recorded eval run submitted. */
function proposalIn(recorded: unknown): Proposal {
  const trace: Trace = TraceSchema.parse(recorded);
  const step = trace.steps.find((candidate) => candidate.type === "proposal");
  if (step?.type !== "proposal") throw new Error("The trace holds no Proposal");
  return step.proposal;
}

function scenarioBoard(id: string): WorkOrder[] {
  const scenario = goldenScenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`No golden scenario ${id}`);
  return scenario.board;
}

/** The context Intake builds: the Sender's Tenant and the Board's open Work Orders. */
function contextFor(board: readonly WorkOrder[], senderTenantId: string | undefined = "tenant-maya"): RoutingContext {
  return {
    senderTenantId,
    attachTargets: [],
    openWorkOrders: board.filter((workOrder) => workOrder.status === "open"),
  };
}

const unit = (unitId: string): WorkOrderLocation => ({ type: "unit", unitId });
const commonArea = (commonAreaId: string): WorkOrderLocation => ({ type: "common-area", commonAreaId });

function create(
  location: WorkOrderLocation,
  trade: CreateWorkOrderOperation["trade"],
  urgency: CreateWorkOrderOperation["urgency"] = "routine",
): CreateWorkOrderOperation {
  return { type: "create", location, title: "Problem", description: "Described problem.", trade, urgency };
}

function proposalOf(...operations: Proposal["operations"]): Proposal {
  return { classification: "maintenance", operations, uncertain: false, draftReplies: [], reasoning: "Scripted." };
}

function workOrder(id: string, location: WorkOrderLocation, trade: WorkOrder["trade"], overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id,
    location,
    title: "Existing problem",
    description: "An existing problem.",
    trade,
    urgency: "routine",
    status: "open",
    messageIds: ["msg-0"],
    raisedByTenantId: "tenant-maya",
    ...overrides,
  };
}

/** Maya's (2A) open plumbing Work Order. */
const mayaPlumbing = workOrder("WO-2", unit("harbor-view-2a"), "plumbing");
/** An open appliance Work Order in the Harbor View laundry room, raised by Luis (3B). */
const laundryAppliance = workOrder("WO-5", commonArea("harbor-view-laundry-room"), "appliance", {
  raisedByTenantId: "tenant-luis",
  urgency: "urgent",
});

describe("possible-duplicate review rule", () => {
  describe("the recorded misses from the committed scorecard", () => {
    it("sends qwen's laundry-room create to review: WO-5 is open with the same Common Area and Trade", () => {
      const routing = decideRouting(
        proposalIn(qwenCommonAreaMerge),
        contextFor(scenarioBoard("common-area-merge-across-units"), "tenant-maya"),
      );

      expect(routing).toEqual({
        outcome: "review",
        rules: ["possible-duplicate"],
        reason: "It creates a Work Order where an open Work Order of the same Trade already exists (WO-5).",
      });
    });

    it("sends gpt-oss-120b's hvac create in 3B to review: WO-3 is open with the same Unit and Trade", () => {
      const routing = decideRouting(
        proposalIn(gptOssAttachAndCreate),
        contextFor(scenarioBoard("multi-problem-attach-and-create"), "tenant-luis"),
      );

      expect(routing).toMatchObject({ outcome: "review", rules: ["possible-duplicate"] });
      expect(routing.reason).toContain("(WO-3)");
    });
  });

  describe("what doesn't match", () => {
    it("ignores an open Work Order of a different Trade in the same Location", () => {
      const routing = decideRouting(proposalOf(create(unit("harbor-view-2a"), "electrical")), contextFor([mayaPlumbing]));
      expect(routing).toMatchObject({ outcome: "auto-apply", rules: [] });
    });

    it("ignores an open Work Order of the same Trade in a different Unit", () => {
      const routing = decideRouting(proposalOf(create(unit("harbor-view-1a"), "plumbing")), contextFor([mayaPlumbing]));
      expect(routing).toMatchObject({ outcome: "auto-apply", rules: [] });
    });

    it("never matches a Unit create to a Common Area Work Order, or the reverse", () => {
      const laundryPlumbing = workOrder("WO-7", commonArea("harbor-view-laundry-room"), "plumbing");

      expect(
        decideRouting(proposalOf(create(unit("harbor-view-2a"), "plumbing")), contextFor([laundryPlumbing])),
      ).toMatchObject({ outcome: "auto-apply", rules: [] });
      expect(
        decideRouting(proposalOf(create(commonArea("harbor-view-laundry-room"), "plumbing")), contextFor([mayaPlumbing])),
      ).toMatchObject({ outcome: "auto-apply", rules: [] });
    });

    it("ignores a closed Work Order with the same Location and Trade", () => {
      const closed = { ...mayaPlumbing, status: "closed" as const };
      const proposal = proposalOf(create(unit("harbor-view-2a"), "plumbing"));

      expect(decideRouting(proposal, contextFor([closed]))).toMatchObject({ outcome: "auto-apply", rules: [] });
      // Even if a caller passes it along, a closed Work Order never matches.
      expect(decideRouting(proposal, { ...contextFor([]), openWorkOrders: [closed] })).toMatchObject({
        outcome: "auto-apply",
      });
    });

    it("doesn't apply to an attach, which is the match the rule backstops", () => {
      const routing = decideRouting(
        proposalOf({ type: "attach", workOrderId: "WO-2", matchType: "same-tenant", information: "Still dripping." }),
        { ...contextFor([mayaPlumbing]), attachTargets: [mayaPlumbing] },
      );
      expect(routing).toMatchObject({ outcome: "auto-apply", rules: [] });
    });
  });

  describe("what matches", () => {
    it("matches whoever raised the open Work Order and whatever its Urgency", () => {
      // Maya creates in the laundry room; Luis raised WO-5 there, and its Urgency differs.
      const routing = decideRouting(
        proposalOf(create(commonArea("harbor-view-laundry-room"), "appliance", "routine")),
        contextFor([laundryAppliance], "tenant-maya"),
      );
      expect(routing).toMatchObject({ outcome: "review", rules: ["possible-duplicate"] });
    });

    it("names every matching open Work Order", () => {
      const secondLaundry = workOrder("WO-8", commonArea("harbor-view-laundry-room"), "appliance");
      const routing = decideRouting(
        proposalOf(create(commonArea("harbor-view-laundry-room"), "appliance")),
        contextFor([laundryAppliance, mayaPlumbing, secondLaundry]),
      );
      expect(routing.reason).toBe(
        "It creates a Work Order where an open Work Order of the same Trade already exists (WO-5, WO-8).",
      );
    });

    it("matches two creates with the same Location and Trade within one Proposal", () => {
      const routing = decideRouting(
        proposalOf(create(unit("harbor-view-2a"), "plumbing"), create(unit("harbor-view-2a"), "plumbing")),
        contextFor([]),
      );
      expect(routing).toEqual({
        outcome: "review",
        rules: ["possible-duplicate"],
        reason: "It creates more than one Work Order with the same Location and Trade within this same Proposal.",
      });
    });

    it("lists possible-duplicate alongside every other rule a Proposal triggers", () => {
      const proposal: Proposal = {
        ...proposalOf(
          create(commonArea("harbor-view-laundry-room"), "appliance"),
          { type: "attach", workOrderId: "WO-2", matchType: "cross-tenant", information: "Heard it too." },
        ),
        uncertain: true,
        draftReplies: [{ purpose: "missing-unit", body: "Which Unit are you in? Harbor Lane Property Management" }],
      };

      const routing = decideRouting(proposal, {
        senderTenantId: undefined,
        attachTargets: [mayaPlumbing],
        openWorkOrders: [mayaPlumbing, laundryAppliance],
      });

      expect(routing).toMatchObject({
        outcome: "review",
        rules: ["uncertain", "cross-tenant-match", "unknown-sender", "draft-reply", "possible-duplicate"],
      });
      expect(routing.reason).toContain("(WO-5)");
    });
  });

  describe("with an emergency (ADR 0003's split)", () => {
    it("applies and flags an emergency create that is itself a possible duplicate", () => {
      const proposal = proposalOf(create(unit("harbor-view-2a"), "plumbing", "emergency"));
      const routing = decideRouting(proposal, contextFor([mayaPlumbing]));

      expect(routing).toMatchObject({ outcome: "apply-and-flag", rules: ["emergency", "possible-duplicate"] });
      expect(routing.reason).toContain("(WO-2)");
    });

    it("holds back a non-emergency possible duplicate alongside an emergency", () => {
      const emergency = create(unit("harbor-view-2a"), "electrical", "emergency");
      const duplicate = create(unit("harbor-view-2a"), "plumbing");
      const proposal = proposalOf(emergency, duplicate);
      const context = contextFor([mayaPlumbing]);

      expect(decideRouting(proposal, context)).toMatchObject({
        outcome: "split",
        rules: ["emergency", "possible-duplicate"],
      });
      const { flagged, pending } = splitEmergency(proposal, context);
      expect(flagged).toMatchObject({
        proposal: { operations: [emergency] },
        routing: { outcome: "apply-and-flag", rules: ["emergency"] },
      });
      expect(pending).toMatchObject({
        proposal: { operations: [duplicate] },
        routing: { outcome: "review", rules: ["possible-duplicate"] },
      });
      expect(pending.routing.reason).toContain("(WO-2)");
    });

    it("keeps a match between two creates on both parts when the split separates them", () => {
      const emergency = create(unit("harbor-view-3b"), "plumbing", "emergency");
      const sameProblem = create(unit("harbor-view-3b"), "plumbing", "urgent");
      const proposal = proposalOf(emergency, sameProblem);
      const context = contextFor([], "tenant-luis");

      expect(decideRouting(proposal, context)).toMatchObject({
        outcome: "split",
        rules: ["emergency", "possible-duplicate"],
      });
      const { flagged, pending } = splitEmergency(proposal, context);
      expect(flagged.routing).toMatchObject({ outcome: "apply-and-flag", rules: ["emergency", "possible-duplicate"] });
      expect(pending.routing).toMatchObject({ outcome: "review", rules: ["possible-duplicate"] });
      expect(pending.routing.reason).toContain("same Proposal");
    });
  });
});

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

describe("Intake with a missed match", () => {
  it("sends the create to the Review Queue instead of putting a duplicate on the Board", async () => {
    const board = new FakeBoard(scenarioBoard("common-area-merge-across-units"));
    const before = await board.listWorkOrders();
    const reviewQueue = new InMemoryReviewQueue();
    const message: Message = {
      id: "msg-laundry-leak",
      sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
      receivedAt: "2026-11-16T09:00:00Z",
      body: "The washing machine by the door in the laundry room is leaking all over the floor again.",
    };
    const proposal = proposalIn(qwenCommonAreaMerge);
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCallTurn("call-1", "lookUpSender", { email: message.sender.email }),
        toolCallTurn("call-2", "submitProposal", proposal),
      ],
    });

    const result = await runIntake(message, { model, board, propertyRoster, reviewQueue });

    expect(result.routing).toMatchObject({ outcome: "review", rules: ["possible-duplicate"] });
    expect(result.routing.reason).toContain("(WO-5)");
    expect(result.createdWorkOrders).toEqual([]);
    expect(await board.listWorkOrders()).toEqual(before);
    expect(await reviewQueue.list()).toMatchObject([{ status: "pending", proposal, routing: result.routing }]);
  });
});
