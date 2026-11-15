import type { CreateWorkOrderOperation, Proposal } from "@/domain";
import type { ExpectedProposal, ExpectedWorkOrder } from "./scenario";

export const DIMENSIONS = ["classification", "unit", "trade", "urgency"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** One dimension's grade. "skip" means the dimension doesn't apply (for example, no Work Orders expected or proposed). */
export type Grade =
  | { dimension: Dimension; status: "pass"; detail: string }
  | { dimension: Dimension; status: "fail"; detail: string }
  | { dimension: Dimension; status: "skip"; detail: string };

/** Grade a Proposal against the expected one, one rule-based grader per dimension. */
export function gradeProposal(actual: Proposal, expected: ExpectedProposal): Grade[] {
  return [
    gradeClassification(actual, expected),
    gradeWorkOrderField(actual, expected, "unit", (op, exp) => compare(op.unitId, [exp.unitId])),
    gradeWorkOrderField(actual, expected, "trade", (op, exp) =>
      compare(op.trade, typeof exp.trade === "string" ? [exp.trade] : exp.trade),
    ),
    gradeWorkOrderField(actual, expected, "urgency", (op, exp) => compare(op.urgency, [exp.urgency])),
  ];
}

/** Every dimension fails for the same reason, such as the agent submitting no Proposal. */
export function failAll(reason: string): Grade[] {
  return DIMENSIONS.map((dimension) => ({ dimension, status: "fail", detail: reason }));
}

function gradeClassification(actual: Proposal, expected: ExpectedProposal): Grade {
  return actual.classification === expected.classification
    ? { dimension: "classification", status: "pass", detail: actual.classification }
    : {
        dimension: "classification",
        status: "fail",
        detail: `expected ${expected.classification}, got ${actual.classification}`,
      };
}

type Comparison = { ok: true; value: string } | { ok: false; expected: string; got: string };

function compare(got: string, acceptable: readonly string[]): Comparison {
  return acceptable.includes(got)
    ? { ok: true, value: got }
    : { ok: false, expected: acceptable.join(" or "), got };
}

/**
 * Pairs proposed Work Orders with expected ones in order and checks one field of each.
 * A missing or extra Work Order fails the dimension.
 */
function gradeWorkOrderField(
  actual: Proposal,
  expected: ExpectedProposal,
  dimension: Exclude<Dimension, "classification">,
  check: (operation: CreateWorkOrderOperation, expected: ExpectedWorkOrder) => Comparison,
): Grade {
  const operations = actual.operations;
  const wanted = expected.workOrders;
  if (operations.length === 0 && wanted.length === 0) {
    return { dimension, status: "skip", detail: "no Work Orders expected or proposed" };
  }
  if (operations.length !== wanted.length) {
    return {
      dimension,
      status: "fail",
      detail: `expected ${countWorkOrders(wanted.length)}, got ${countWorkOrders(operations.length)}`,
    };
  }

  const values: string[] = [];
  const problems: string[] = [];
  operations.forEach((operation, index) => {
    const result = check(operation, wanted[index]!);
    const label = wanted.length > 1 ? `Work Order ${index + 1}: ` : "";
    if (result.ok) values.push(`${label}${result.value}`);
    else problems.push(`${label}expected ${result.expected}, got ${result.got}`);
  });
  return problems.length > 0
    ? { dimension, status: "fail", detail: problems.join("; ") }
    : { dimension, status: "pass", detail: values.join("; ") };
}

function countWorkOrders(count: number): string {
  return count === 1 ? "1 Work Order" : `${count} Work Orders`;
}
