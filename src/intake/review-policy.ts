import type { Proposal, RoutingDecision } from "@/domain";

/**
 * Fixed rules that decide what happens to a Proposal (ADR 0003).
 * Until the review policy lands, every Proposal is auto-applied.
 */
export function decideRouting(proposal: Proposal): RoutingDecision {
  if (proposal.operations.length === 0) {
    return { outcome: "auto-apply", reason: "Proposal makes no changes to the Board." };
  }
  if (proposal.operations.every((operation) => operation.type === "attach")) {
    return { outcome: "auto-apply", reason: "Updates existing Work Order(s)." };
  }
  return { outcome: "auto-apply", reason: "Clear new Work Order(s)." };
}
