/**
 * The data behind the landing page's animated example: one recorded replay, cut down to the
 * beats the hero plays in order (the messy Message, the agent's lookups, the Work Orders it
 * proposes, and what the review rules did). Kept free of React so it can be tested.
 */
import type { RoutingDecision, Trade, Urgency, WorkOrderLocation } from "@/domain";
import type { Replay } from "@/replays";
import { senderName, toolLabel } from "./index";

/** The replay the hero plays: two problems in one Message, one matched and one new. */
export const LANDING_REPLAY_ID = "multi-problem-attach-and-create";

/** One read-only lookup the agent made. */
export interface LandingLookup {
  label: string;
  /** The lookup's input values, such as the email or search query. */
  detail: string;
}

/** One Work Order the Proposal creates, or one it adds the Message to. */
export type LandingWorkOrder =
  | { kind: "create"; title: string; urgency: Urgency; trade: Trade; location: WorkOrderLocation }
  | { kind: "attach"; workOrderId: string; title: string; information: string };

export interface LandingExample {
  replayId: string;
  title: string;
  sender: string;
  body: string;
  lookups: LandingLookup[];
  workOrders: LandingWorkOrder[];
  routing?: RoutingDecision;
}

function inputDetail(input: unknown): string {
  if (input === null || typeof input !== "object") return input === undefined ? "" : String(input);
  return Object.values(input)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" · ");
}

/** Cut a replay down to the hero's beats. */
export function landingExample(replay: Replay): LandingExample {
  const steps = replay.trace.steps;
  const proposal = steps.findLast((step) => step.type === "proposal")?.proposal;
  const routing = steps.findLast((step) => step.type === "routing")?.decision;

  const lookups = steps.flatMap((step) =>
    step.type === "tool-call" ? [{ label: toolLabel(step.toolName), detail: inputDetail(step.input) }] : [],
  );

  const workOrders = (proposal?.operations ?? []).map((operation): LandingWorkOrder => {
    if (operation.type === "create") {
      const { title, urgency, trade, location } = operation;
      return { kind: "create", title, urgency, trade, location };
    }
    const target = replay.board.find((workOrder) => workOrder.id === operation.workOrderId);
    return {
      kind: "attach",
      workOrderId: operation.workOrderId,
      title: target?.title ?? operation.workOrderId,
      information: operation.information,
    };
  });

  return {
    replayId: replay.id,
    title: replay.title,
    sender: senderName(replay.message),
    body: replay.message.body,
    lookups,
    workOrders,
    ...(routing ? { routing } : {}),
  };
}

/** The hero's replay, or the first one with Work Orders if it's missing. */
export function pickLandingReplay(replays: readonly Replay[]): Replay | undefined {
  return (
    replays.find((replay) => replay.id === LANDING_REPLAY_ID) ??
    replays.find((replay) => landingExample(replay).workOrders.length > 0) ??
    replays[0]
  );
}
