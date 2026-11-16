import type { Proposal, ProposalOperation, ReviewRule, RoutingDecision, WorkOrder } from "@/domain";

/** Facts about the Message the review policy reads alongside the Proposal's labels. */
export interface RoutingContext {
  /** The Sender's Tenant, or undefined if the Sender isn't in the Property Roster. */
  senderTenantId: string | undefined;
  /** The Work Orders the Proposal attaches to, as they are on the Board now. */
  attachTargets: readonly WorkOrder[];
}

const RULE_REASONS: Record<ReviewRule, string> = {
  emergency: "An emergency Work Order: applied immediately and flagged for a Coordinator.",
  uncertain: "The agent flagged this Proposal as uncertain.",
  "cross-tenant-match": "It matches a Work Order raised by a different Tenant.",
  "unknown-sender": "The Sender isn't in the Property Roster.",
};

/**
 * Fixed rules that decide what happens to a Proposal (ADR 0003). They read
 * categorical labels only, never a numeric confidence:
 * - send to the Review Queue if the agent flagged the Proposal uncertain, if it
 *   matches a Work Order raised by a different Tenant, or if the Sender isn't
 *   in the Property Roster;
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
  const rules = triggeredRules(proposal, context);

  if (rules.includes("emergency")) {
    const reviewRules = rules.filter((rule) => rule !== "emergency");
    // Nothing besides the emergency creates is left to review: apply it all and flag every rule,
    // so a Coordinator handles any doubt after the fact.
    if (reviewRules.length > 0 && hasOtherOperations(proposal)) {
      return {
        outcome: "split",
        rules,
        reason: `${RULE_REASONS.emergency} The rest of the Proposal waits for review: ${describeRules(reviewRules)}`,
      };
    }
    return { outcome: "apply-and-flag", rules, reason: describeRules(rules) };
  }
  if (rules.length > 0) {
    return { outcome: "review", rules, reason: describeRules(rules) };
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
  const emergency: Proposal = { ...proposal, operations: proposal.operations.filter(isEmergencyCreate) };
  const rest: Proposal = {
    ...proposal,
    operations: proposal.operations.filter((operation) => !isEmergencyCreate(operation)),
  };
  // The emergency part carries the rules that are about the whole Proposal, so the
  // Coordinator sees them on the flag. A cross-Tenant match is never an emergency create.
  const flaggedRules = triggeredRules(emergency, context);
  return {
    flagged: {
      proposal: emergency,
      routing: { outcome: "apply-and-flag", rules: flaggedRules, reason: describeRules(flaggedRules) },
    },
    pending: { proposal: rest, routing: decideRouting(rest, context) },
  };
}

function triggeredRules(proposal: Proposal, context: RoutingContext): ReviewRule[] {
  const rules: ReviewRule[] = [];
  if (proposal.operations.some(isEmergencyCreate)) rules.push("emergency");
  if (proposal.uncertain) rules.push("uncertain");
  if (crossesTenants(proposal, context)) rules.push("cross-tenant-match");
  if (context.senderTenantId === undefined) rules.push("unknown-sender");
  return rules;
}

function isEmergencyCreate(operation: ProposalOperation): boolean {
  return operation.type === "create" && operation.urgency === "emergency";
}

/** Whether the Proposal holds anything besides emergency creates. Draft Replies will count here too (Issue 08). */
function hasOtherOperations(proposal: Proposal): boolean {
  return proposal.operations.some((operation) => !isEmergencyCreate(operation));
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

function describeRules(rules: readonly ReviewRule[]): string {
  return rules.map((rule) => RULE_REASONS[rule]).join(" ");
}
