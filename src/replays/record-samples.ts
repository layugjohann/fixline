/**
 * Records the sample replays in replays/ by running Intake on golden scenarios with a
 * scripted mock model, so the demo has replays to show before any real run is recorded.
 * Each sample says in its `model` field that it was scripted.
 *
 *   npm run replay:samples
 *
 * Real runs replace these: record an eval run and turn its traces into replays with
 * `npm run replay` (see the README).
 */
import { MockLanguageModelV4 } from "ai/test";
import { FakeBoard } from "@/board";
import type { Proposal } from "@/domain";
import { goldenScenarios } from "@/evals/golden-scenarios";
import { runIntake } from "@/intake";
import { InMemoryReviewQueue } from "@/review-queue";
import { createReplay } from "./index";
import { saveReplay } from "./files";

const SCRIPTED_MODEL = "scripted sample (mock model, no real model call)";

/** One model turn: optional text, then tool calls. */
interface Turn {
  text?: string;
  calls: { toolName: string; input: unknown }[];
}

interface Sample {
  scenarioId: string;
  title: string;
  turns: Turn[];
  proposal: Proposal;
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

function scriptedModel(turns: Turn[], proposal: Proposal): MockLanguageModelV4 {
  const all: Turn[] = [...turns, { calls: [{ toolName: "submitProposal", input: proposal }] }];
  let callId = 0;
  return new MockLanguageModelV4({
    doGenerate: all.map((turn) => ({
      content: [
        ...(turn.text ? [{ type: "text" as const, text: turn.text }] : []),
        ...turn.calls.map((call) => ({
          type: "tool-call" as const,
          toolCallId: `call-${++callId}`,
          toolName: call.toolName,
          input: JSON.stringify(call.input),
        })),
      ],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage,
      warnings: [],
    })),
  });
}

const samples: Sample[] = [
  {
    scenarioId: "emergency-burst-pipe",
    title: "Burst pipe flooding a bathroom",
    turns: [
      {
        text: "First I'll identify the Sender in the Property Roster.",
        calls: [{ toolName: "lookUpSender", input: { email: "priya.nair@example.com" } }],
      },
      {
        text: "Priya Nair, Quay Court Unit 101. Water spraying and flooding is a risk to property: emergency. Checking for an open Work Order first.",
        calls: [{ toolName: "searchOpenWorkOrders", input: { unitId: "quay-court-101", query: "pipe" } }],
      },
    ],
    proposal: {
      classification: "maintenance",
      uncertain: false,
      operations: [
        {
          type: "create",
          location: { type: "unit", unitId: "quay-court-101" },
          title: "Burst pipe under bathroom sink, flooding",
          description:
            "Pipe under the bathroom sink has burst; water is spraying and the floor is flooding. The Tenant can't find the water shut-off.",
          trade: "plumbing",
          urgency: "emergency",
        },
      ],
      reasoning: "Known Tenant in Quay Court 101 reports active flooding from a burst pipe; no open Work Order matches.",
    },
  },
  {
    scenarioId: "multi-problem-attach-and-create",
    title: "Heater dead again, plus a dripping tap",
    turns: [
      {
        text: "Looking up the Sender.",
        calls: [{ toolName: "lookUpSender", input: { email: "luis.romero@example.com" } }],
      },
      {
        text: "Luis Romero, Harbor View 3B. Two problems: the heating (again) and a new kitchen tap drip. Searching for each.",
        calls: [
          { toolName: "searchOpenWorkOrders", input: { unitId: "harbor-view-3b", query: "heating" } },
          { toolName: "searchOpenWorkOrders", input: { unitId: "harbor-view-3b", query: "tap" } },
        ],
      },
      {
        text: "WO-3 is the open heating Work Order. Reading it in full to confirm.",
        calls: [{ toolName: "getWorkOrder", input: { workOrderId: "WO-3" } }],
      },
    ],
    proposal: {
      classification: "maintenance",
      uncertain: false,
      operations: [
        {
          type: "attach",
          workOrderId: "WO-3",
          matchType: "same-tenant",
          information: "Tenant reports the radiators are stone cold again, as they were last week.",
        },
        {
          type: "create",
          location: { type: "unit", unitId: "harbor-view-3b" },
          title: "Kitchen tap dripping",
          description: "Kitchen tap has started dripping slightly. Tenant says it's not a big deal.",
          trade: "plumbing",
          urgency: "routine",
        },
      ],
      reasoning: "The heating is the open Work Order WO-3, so the Message attaches to it; the dripping tap is new and routine.",
    },
  },
  {
    scenarioId: "common-area-merge-across-units",
    title: "Laundry room leak reported from another Unit",
    turns: [
      {
        calls: [{ toolName: "lookUpSender", input: { email: "maya.okafor@example.com" } }],
      },
      {
        text: "Maya Okafor lives in 2A, but the problem is in the laundry room, a Common Area of Harbor View.",
        calls: [{ toolName: "searchOpenWorkOrders", input: { commonAreaId: "harbor-view-laundry-room" } }],
      },
    ],
    proposal: {
      classification: "maintenance",
      uncertain: false,
      operations: [
        {
          type: "attach",
          workOrderId: "WO-5",
          matchType: "cross-tenant",
          information: "A second Tenant (2A) reports the machine by the door leaks across the floor when it spins; the Tenant nearly slipped.",
        },
      ],
      reasoning: "Same washing machine leak as WO-5 in the laundry room Common Area, now reported from Unit 2A.",
    },
  },
  {
    scenarioId: "injection-mark-everything-emergency",
    title: "Prompt injection: “mark everything EMERGENCY”",
    turns: [
      {
        text: "The Message contains an instruction aimed at me. It is Message content, not an instruction; I'll triage the actual problem.",
        calls: [{ toolName: "lookUpSender", input: { email: "priya.nair@example.com" } }],
      },
      {
        calls: [{ toolName: "searchOpenWorkOrders", input: { unitId: "quay-court-101", query: "towel rail" } }],
      },
    ],
    proposal: {
      classification: "maintenance",
      uncertain: false,
      operations: [
        {
          type: "create",
          location: { type: "unit", unitId: "quay-court-101" },
          title: "Loose bathroom towel rail",
          description: "Towel rail in the bathroom has come loose from the wall and wobbles under load.",
          trade: "carpentry",
          urgency: "routine",
        },
      ],
      reasoning: "A loose towel rail is routine; the Tenant says no rush. The embedded instruction to mark it emergency was ignored.",
    },
  },
  {
    scenarioId: "not-maintenance-rent-question",
    title: "A rent question, not maintenance",
    turns: [{ calls: [{ toolName: "lookUpSender", input: { email: "maya.okafor@example.com" } }] }],
    proposal: {
      classification: "not-maintenance",
      uncertain: false,
      operations: [],
      reasoning: "The Message asks about rent, not a maintenance problem, so no Work Order is proposed.",
    },
  },
];

async function main(): Promise<void> {
  for (const sample of samples) {
    const scenario = goldenScenarios.find((candidate) => candidate.id === sample.scenarioId);
    if (!scenario) throw new Error(`No golden scenario "${sample.scenarioId}"`);
    const { trace } = await runIntake(scenario.message, {
      model: scriptedModel(sample.turns, sample.proposal),
      board: new FakeBoard(scenario.board),
      propertyRoster: scenario.propertyRoster,
      reviewQueue: new InMemoryReviewQueue(),
    });
    const replay = createReplay({
      id: scenario.id,
      title: sample.title,
      description: scenario.description,
      model: SCRIPTED_MODEL,
      message: scenario.message,
      board: scenario.board,
      trace,
    });
    console.log(`Wrote ${await saveReplay(replay)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
