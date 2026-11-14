import type { Proposal, RoutingDecision } from "@/domain";

/**
 * Fixed rules that decide what happens to a Proposal (ADR 0003).
 * The tracer only has the create-only path, which is auto-applied.
 */
export function decideRouting(proposal: Proposal): RoutingDecision {
  if (proposal.operations.length === 0) {
    return { outcome: "auto-apply", reason: "Proposal makes no changes to the Board." };
  }
  return { outcome: "auto-apply", reason: "Clear new Work Order(s)." };
}
