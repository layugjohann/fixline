import {
  sameLocation,
  type CreateWorkOrderOperation,
  type Proposal,
  type ProposalOperation,
  type ReviewRule,
  type RoutingDecision,
  type WorkOrder,
} from "@/domain";

/** Facts about the Message the review policy reads alongside the Proposal's labels. */
export interface RoutingContext {
  /** The Sender's Tenant, or undefined if the Sender isn't in the Property Roster. */
  senderTenantId: string | undefined;
  /** The Work Orders the Proposal attaches to, as they are on the Board now. */
  attachTargets: readonly WorkOrder[];
  /** The Board's open Work Orders, read by Intake before routing, for the possible-duplicate rule. */
  openWorkOrders: readonly WorkOrder[];
}

/** Fixed reasons for each rule. The possible-duplicate reason is built from its matches instead. */
const RULE_REASONS: Record<Exclude<ReviewRule, "possible-duplicate">, string> = {
  emergency: "An emergency Work Order: applied immediately and flagged for a Coordinator.",
  uncertain: "The agent flagged this Proposal as uncertain.",
  "cross-tenant-match": "It matches a Work Order raised by a different Tenant.",
  "unknown-sender": "The Sender isn't in the Property Roster.",
  "draft-reply": "It includes a Draft Reply, which a Coordinator must approve before it counts as sent.",
};

/**
 * Fixed rules that decide what happens to a Proposal (ADR 0003). They read
 * categorical labels only, never a numeric confidence:
 * - send to the Review Queue if the agent flagged the Proposal uncertain, if it
 *   matches a Work Order raised by a different Tenant, or if the Sender isn't
 *   in the Property Roster, or if it includes a Draft Reply, or if it creates a
 *   Work Order with the same Location and Trade as an open Work Order or as
 *   another create in the same Proposal (a possible duplicate);
 * - apply any emergency Work Order immediately and flag it for a Coordinator.
 *   If the Proposal also triggers a review rule, it is split: only the
 *   emergency creates are applied and flagged, and every other operation goes
 *   to the Review Queue (see {@link splitEmergency});
 * - otherwise (clear new routine/urgent Work Orders, obvious same-Tenant
 *   matches, or no changes at all): auto-apply.
 *
 * A match counts as cross-Tenant if the agent labels it so, or if the Board
 * shows the Work Order wasn't raised by the Sender's Tenant: the label alone
 * can't send a cross-Tenant match to the Board unchecked.
 */
export function decideRouting(proposal: Proposal, context: RoutingContext): RoutingDecision {
  return route(proposal, context, proposal);
}

/**
 * Routes `proposal`, which is either a whole Proposal or one part of `whole` after a split.
 * Possible duplicates are always looked for across the whole Proposal, so a match between two
 * creates isn't lost when the split separates them.
 */
function route(proposal: Proposal, context: RoutingContext, whole: Proposal): RoutingDecision {
  const rules = triggeredRules(proposal, context, whole);
  const describe = (shown: readonly ReviewRule[]) => describeRules(shown, proposal, context, whole);

  if (rules.includes("emergency")) {
    const reviewRules = rules.filter((rule) => rule !== "emergency");
    // Nothing besides the emergency creates is left to review: apply it all and flag every rule,
    // so a Coordinator handles any doubt after the fact.
    if (reviewRules.length > 0 && hasOtherOperations(proposal)) {
      return {
        outcome: "split",
        rules,
        reason: `${RULE_REASONS.emergency} The rest of the Proposal waits for review: ${describe(reviewRules)}`,
      };
    }
    return { outcome: "apply-and-flag", rules, reason: describe(rules) };
  }
  if (rules.length > 0) {
    return { outcome: "review", rules, reason: describe(rules) };
  }
  return {
    outcome: "auto-apply",
    rules,
    reason:
      proposal.operations.length === 0
        ? "Proposal makes no changes to the Board."
        : "Clear new routine or urgent Work Order(s), or obvious same-Tenant matches.",
  };
}

/** One part of a split Proposal, with the routing that applies to that part alone. */
export interface RoutedPart {
  proposal: Proposal;
  routing: RoutingDecision;
}

/**
 * Splits a Proposal routed "split" (ADR 0003): the emergency creates are applied
 * and flagged, and every other operation goes to the Review Queue under the
 * rules that sent it there.
 */
export function splitEmergency(
  proposal: Proposal,
  context: RoutingContext,
): { flagged: RoutedPart; pending: RoutedPart } {
  // Draft Replies always wait for review, even alongside an emergency.
  const emergency: Proposal = {
    ...proposal,
    operations: proposal.operations.filter(isEmergencyCreate),
    draftReplies: [],
  };
  const rest: Proposal = {
    ...proposal,
    operations: proposal.operations.filter((operation) => !isEmergencyCreate(operation)),
  };
  // The emergency part carries the rules that are about the whole Proposal, so the
  // Coordinator sees them on the flag. A cross-Tenant match is never an emergency create.
  // Each part carries possible-duplicate when one of its own creates is a possible duplicate,
  // including of a create that the split put in the other part.
  const flaggedRules = triggeredRules(emergency, context, proposal);
  return {
    flagged: {
      proposal: emergency,
      routing: {
        outcome: "apply-and-flag",
        rules: flaggedRules,
        reason: describeRules(flaggedRules, emergency, context, proposal),
      },
    },
    pending: { proposal: rest, routing: route(rest, context, proposal) },
  };
}

function triggeredRules(proposal: Proposal, context: RoutingContext, whole: Proposal): ReviewRule[] {
  const rules: ReviewRule[] = [];
  if (proposal.operations.some(isEmergencyCreate)) rules.push("emergency");
  if (proposal.uncertain) rules.push("uncertain");
  if (crossesTenants(proposal, context)) rules.push("cross-tenant-match");
  if (context.senderTenantId === undefined) rules.push("unknown-sender");
  if (proposal.draftReplies.length > 0) rules.push("draft-reply");
  if (isPossibleDuplicate(possibleDuplicates(proposal, context, whole))) rules.push("possible-duplicate");
  return rules;
}

function isEmergencyCreate(operation: ProposalOperation): boolean {
  return operation.type === "create" && operation.urgency === "emergency";
}

/** Whether the Proposal holds anything besides emergency creates, including Draft Replies. */
function hasOtherOperations(proposal: Proposal): boolean {
  return proposal.draftReplies.length > 0 || proposal.operations.some((operation) => !isEmergencyCreate(operation));
}

function crossesTenants(proposal: Proposal, context: RoutingContext): boolean {
  return proposal.operations.some((operation) => {
    if (operation.type !== "attach") return false;
    if (operation.matchType === "cross-tenant") return true;
    const target = context.attachTargets.find((workOrder) => workOrder.id === operation.workOrderId);
    // A missing target is Proposal validation's concern, not a routing rule.
    return target !== undefined && (context.senderTenantId === undefined || target.raisedByTenantId !== context.senderTenantId);
  });
}

/** What the creates in a Proposal (or one part of it) possibly duplicate. */
interface PossibleDuplicates {
  /** Ids of open Work Orders with the same Location and Trade as one of the creates. */
  workOrderIds: string[];
  /** Whether one of the creates has the same Location and Trade as another create in the whole Proposal. */
  withinProposal: boolean;
}

/**
 * Finds the possible duplicates of the creates in `proposal` (the whole Proposal or one part
 * of `whole`): open Work Orders on the Board, and other creates anywhere in `whole`, with the
 * same Location and Trade. Who raised a Work Order and its Urgency don't matter.
 */
function possibleDuplicates(proposal: Proposal, context: RoutingContext, whole: Proposal): PossibleDuplicates {
  const creates = proposal.operations.filter(isCreate);
  const wholeCreates = whole.operations.filter(isCreate);
  const sameKey = (a: CreateWorkOrderOperation | WorkOrder, b: CreateWorkOrderOperation | WorkOrder) =>
    a.trade === b.trade && sameLocation(a.location, b.location);

  const workOrderIds = context.openWorkOrders
    .filter((workOrder) => workOrder.status === "open" && creates.some((create) => sameKey(create, workOrder)))
    .map((workOrder) => workOrder.id);
  // A split keeps the same operation objects, so a create is told apart from the others by identity.
  const withinProposal = creates.some((create) =>
    wholeCreates.some((other) => other !== create && sameKey(create, other)),
  );
  return { workOrderIds, withinProposal };
}

function isPossibleDuplicate(duplicates: PossibleDuplicates): boolean {
  return duplicates.workOrderIds.length > 0 || duplicates.withinProposal;
}

function isCreate(operation: ProposalOperation): operation is CreateWorkOrderOperation {
  return operation.type === "create";
}

/** The possible-duplicate reason, naming the matching Work Order ids. */
function possibleDuplicateReason(duplicates: PossibleDuplicates): string {
  const reasons: string[] = [];
  if (duplicates.workOrderIds.length > 0) {
    reasons.push(
      `It creates a Work Order where an open Work Order of the same Trade already exists (${duplicates.workOrderIds.join(", ")}).`,
    );
  }
  if (duplicates.withinProposal) {
    reasons.push("It creates more than one Work Order with the same Location and Trade within this same Proposal.");
  }
  return reasons.join(" ");
}

function describeRules(
  rules: readonly ReviewRule[],
  proposal: Proposal,
  context: RoutingContext,
  whole: Proposal,
): string {
  return rules
    .map((rule) =>
      rule === "possible-duplicate"
        ? possibleDuplicateReason(possibleDuplicates(proposal, context, whole))
        : RULE_REASONS[rule],
    )
    .join(" ");
}
