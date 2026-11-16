import type { Proposal, ReviewRule, RoutingDecision, WorkOrder } from "@/domain";

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
 * - any emergency Work Order: apply immediately and flag for a Coordinator;
 * - otherwise, send to the Review Queue if the agent flagged the Proposal
 *   uncertain, if it matches a Work Order raised by a different Tenant, or if
 *   the Sender isn't in the Property Roster;
 * - otherwise (clear new routine/urgent Work Orders, obvious same-Tenant
 *   matches, or no changes at all): auto-apply.
 *
 * A match counts as cross-Tenant if the agent labels it so, or if the Board
 * shows the Work Order wasn't raised by the Sender's Tenant: the label alone
 * can't send a cross-Tenant match to the Board unchecked.
 */
export function decideRouting(proposal: Proposal, context: RoutingContext): RoutingDecision {
  const rules: ReviewRule[] = [];

  if (proposal.operations.some((operation) => operation.type === "create" && operation.urgency === "emergency")) {
    rules.push("emergency");
  }
  if (proposal.uncertain) rules.push("uncertain");
  if (crossesTenants(proposal, context)) rules.push("cross-tenant-match");
  if (context.senderTenantId === undefined) rules.push("unknown-sender");

  if (rules.includes("emergency")) {
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

function crossesTenants(proposal: Proposal, context: RoutingContext): boolean {
  return proposal.operations.some((operation) => {
    if (operation.type !== "attach") return false;
    if (operation.matchType === "cross-tenant") return true;
    const target = context.attachTargets.find((workOrder) => workOrder.id === operation.workOrderId);
    // A missing target is Proposal validation's concern, not a routing rule.
    return target !== undefined && (context.senderTenantId === undefined || target.raisedByTenantId !== context.senderTenantId);
  });
}

function describe(rules: readonly ReviewRule[]): string {
  return rules.map((rule) => RULE_REASONS[rule]).join(" ");
}
