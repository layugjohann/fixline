import type { BoardReader } from "@/board";
import { ProposalSchema, type Proposal, type PropertyRoster, type Trace } from "@/domain";

export type ProposalValidation =
  | { valid: true; proposal: Proposal }
  /** `proposal` is set when the Proposal fits the schema but references something it shouldn't. */
  | { valid: false; problems: string[]; proposal?: Proposal };

/**
 * Proposal validation: a schema check, then a check that every Work Order, Unit
 * and Common Area the Proposal references exists. An attach must target a Work
 * Order that is still open: the agent may only add information to open work.
 * Runs before the Board and the Review Queue ever see a Proposal.
 */
export async function validateProposal(
  submitted: unknown,
  deps: { board: BoardReader; propertyRoster: PropertyRoster },
): Promise<ProposalValidation> {
  const parsed = ProposalSchema.safeParse(submitted);
  if (!parsed.success) {
    return {
      valid: false,
      problems: parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  }
  const proposal = parsed.data;
  const unitIds = new Set(deps.propertyRoster.properties.flatMap((property) => property.units.map((unit) => unit.id)));
  const commonAreaIds = new Set(
    deps.propertyRoster.properties.flatMap((property) => property.commonAreas.map((commonArea) => commonArea.id)),
  );

  const problems: string[] = [];
  for (const [index, operation] of proposal.operations.entries()) {
    const at = `Operation ${index + 1}`;
    if (operation.type === "attach") {
      const target = await deps.board.getWorkOrder(operation.workOrderId);
      if (!target) problems.push(`${at} attaches to Work Order ${operation.workOrderId}, which isn't on the Board.`);
      else if (target.status !== "open") {
        problems.push(`${at} attaches to Work Order ${operation.workOrderId}, which is ${target.status}.`);
      }
    } else if (operation.location.type === "unit") {
      if (!unitIds.has(operation.location.unitId)) {
        problems.push(`${at} creates a Work Order in Unit ${operation.location.unitId}, which isn't in the Property Roster.`);
      }
    } else if (!commonAreaIds.has(operation.location.commonAreaId)) {
      problems.push(
        `${at} creates a Work Order in Common Area ${operation.location.commonAreaId}, which isn't in the Property Roster.`,
      );
    }
  }
  return problems.length > 0 ? { valid: false, problems, proposal } : { valid: true, proposal };
}

/**
 * Proposal validation rejected the agent's Proposal. Nothing reached the Board
 * or the Review Queue. The trace records the run up to and including the rejection.
 */
export class InvalidProposalError extends Error {
  constructor(
    readonly problems: string[],
    readonly trace: Trace,
  ) {
    super(`The agent's Proposal was rejected: ${problems.join(" ")}`);
    this.name = "InvalidProposalError";
  }
}
