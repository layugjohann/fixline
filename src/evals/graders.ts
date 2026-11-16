import {
  locationId,
  sameLocation,
  type CreateWorkOrderOperation,
  type Proposal,
  type ProposalOperation,
  type RoutingDecision,
  type WorkOrderLocation,
} from "@/domain";
import type { ExpectedOperation, ExpectedProposal, ExpectedRouting, ExpectedWorkOrder } from "./scenario";

export const DIMENSIONS = ["classification", "count", "match", "location", "trade", "urgency", "routing"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** One dimension's grade. "skip" means the dimension doesn't apply (for example, no Work Orders expected or proposed). */
export type Grade =
  | { dimension: Dimension; status: "pass"; detail: string }
  | { dimension: Dimension; status: "fail"; detail: string }
  | { dimension: Dimension; status: "skip"; detail: string };

/** Grade a Proposal and its routing against the expected ones, one rule-based grader per dimension. */
export function gradeProposal(actual: Proposal, routing: RoutingDecision, expected: ExpectedProposal): Grade[] {
  const pairs = pairOperations(actual.operations, expected.workOrders);
  const labelled = expected.workOrders.length > 1;
  return [
    gradeClassification(actual, expected),
    gradeCount(actual, expected),
    gradeMatch(pairs, labelled),
    gradeWorkOrderField(pairs, labelled, "location", (op, exp) =>
      sameLocation(op.location, exp.location)
        ? { ok: true, value: describeLocation(op.location) }
        : { ok: false, expected: describeLocation(exp.location), got: describeLocation(op.location) },
    ),
    gradeWorkOrderField(pairs, labelled, "trade", (op, exp) =>
      compare(op.trade, typeof exp.trade === "string" ? [exp.trade] : exp.trade),
    ),
    gradeWorkOrderField(pairs, labelled, "urgency", (op, exp) => compare(op.urgency, [exp.urgency])),
    gradeRouting(routing, expected.routing),
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

/**
 * Review routing: did the review policy reach the expected outcome, for (at
 * least) the expected reasons? Since the policy is fixed rules, a failure here
 * means a label the agent set (Urgency, match type, uncertain) was wrong.
 */
function gradeRouting(routing: RoutingDecision, expected: ExpectedRouting): Grade {
  const missing = expected.rules.filter((rule) => !routing.rules.includes(rule));
  const got = describeRouting(routing.outcome, routing.rules);
  return routing.outcome === expected.outcome && missing.length === 0
    ? { dimension: "routing", status: "pass", detail: got }
    : {
        dimension: "routing",
        status: "fail",
        detail: `expected ${describeRouting(expected.outcome, expected.rules)}, got ${got}`,
      };
}

function describeRouting(outcome: string, rules: readonly string[]): string {
  return rules.length > 0 ? `${outcome} (${rules.join(", ")})` : outcome;
}

/** Number of Work Orders: did the agent split the Message into as many operations as there are problems? */
function gradeCount(actual: Proposal, expected: ExpectedProposal): Grade {
  const got = actual.operations.length;
  const wanted = expected.workOrders.length;
  return got === wanted
    ? { dimension: "count", status: "pass", detail: countWorkOrders(got) }
    : { dimension: "count", status: "fail", detail: `expected ${countWorkOrders(wanted)}, got ${countWorkOrders(got)}` };
}

/** One expected operation and the proposed operation it was paired with. */
interface Pair {
  /** Position of the expected operation, used to label it in grade details. */
  index: number;
  expected: ExpectedOperation;
  actual: ProposalOperation;
}

/**
 * Pairs proposed operations with expected ones regardless of order, since a
 * multi-problem Message can list its problems in any order:
 * 1. an expected attach pairs with a proposed attach to the same Work Order;
 * 2. an expected new Work Order pairs with the most similar proposed new Work Order
 *    (location and Trade weigh most, then Urgency);
 * 3. anything left pairs up in order, so a duplicate created instead of attached is
 *    still graded by the match dimension.
 * Operations left unpaired are missing or extra, which only the count dimension grades.
 */
function pairOperations(actual: readonly ProposalOperation[], expected: readonly ExpectedOperation[]): Pair[] {
  const unpaired = actual.map((_, index) => index);
  const pairedWith = new Map<number, number>();
  const take = (expectedIndex: number, actualIndex: number) => {
    pairedWith.set(expectedIndex, actualIndex);
    unpaired.splice(unpaired.indexOf(actualIndex), 1);
  };

  expected.forEach((wanted, index) => {
    if (wanted.type !== "attach") return;
    const found = unpaired.find((candidate) => {
      const operation = actual[candidate]!;
      return operation.type === "attach" && operation.workOrderId === wanted.workOrderId;
    });
    if (found !== undefined) take(index, found);
  });

  expected.forEach((wanted, index) => {
    if (wanted.type !== "create") return;
    let best: number | undefined;
    let bestScore = -1;
    for (const candidate of unpaired) {
      const operation = actual[candidate]!;
      if (operation.type !== "create") continue;
      const score = similarity(operation, wanted);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best !== undefined) take(index, best);
  });

  expected.forEach((_, index) => {
    if (pairedWith.has(index) || unpaired.length === 0) return;
    take(index, unpaired[0]!);
  });

  return expected.flatMap((wanted, index) => {
    const actualIndex = pairedWith.get(index);
    return actualIndex === undefined ? [] : [{ index, expected: wanted, actual: actual[actualIndex]! }];
  });
}

function similarity(operation: CreateWorkOrderOperation, wanted: ExpectedWorkOrder): number {
  const trades: readonly string[] = typeof wanted.trade === "string" ? [wanted.trade] : wanted.trade;
  return (
    (sameLocation(operation.location, wanted.location) ? 2 : 0) +
    (trades.includes(operation.trade) ? 2 : 0) +
    (operation.urgency === wanted.urgency ? 1 : 0)
  );
}

/** Where an operation lands: a new Work Order, or the existing Work Order it attaches to. */
function matchTarget(operation: ProposalOperation | ExpectedOperation): string {
  return operation.type === "attach" ? operation.workOrderId : "new Work Order";
}

/**
 * Match target: for each paired operation, did the agent attach to the right
 * existing Work Order, or create a new one when nothing on the Board matched?
 */
function gradeMatch(pairs: readonly Pair[], labelled: boolean): Grade {
  if (pairs.length === 0) {
    return { dimension: "match", status: "skip", detail: "no Work Orders both expected and proposed" };
  }
  return summarise(
    "match",
    pairs.map((pair) => ({
      label: label(pair, labelled),
      result: compare(matchTarget(pair.actual), [matchTarget(pair.expected)]),
    })),
  );
}

type Comparison = { ok: true; value: string } | { ok: false; expected: string; got: string };

function compare(got: string, acceptable: readonly string[]): Comparison {
  return acceptable.includes(got)
    ? { ok: true, value: got }
    : { ok: false, expected: acceptable.join(" or "), got };
}

/**
 * Checks one field of each paired new Work Order. Only pairs where a new Work
 * Order was both expected and proposed are checked: attaching (or wrongly
 * creating instead of attaching) is graded by the match dimension alone.
 */
function gradeWorkOrderField(
  pairs: readonly Pair[],
  labelled: boolean,
  dimension: Exclude<Dimension, "classification" | "count" | "match" | "routing">,
  check: (operation: CreateWorkOrderOperation, expected: ExpectedWorkOrder) => Comparison,
): Grade {
  const checks = pairs.flatMap((pair) =>
    pair.actual.type === "create" && pair.expected.type === "create"
      ? [{ label: label(pair, labelled), result: check(pair.actual, pair.expected) }]
      : [],
  );
  if (checks.length === 0) {
    return { dimension, status: "skip", detail: "no new Work Order both expected and proposed" };
  }
  return summarise(dimension, checks);
}

function summarise(dimension: Dimension, checks: readonly { label: string; result: Comparison }[]): Grade {
  const values: string[] = [];
  const problems: string[] = [];
  for (const { label, result } of checks) {
    if (result.ok) values.push(`${label}${result.value}`);
    else problems.push(`${label}expected ${result.expected}, got ${result.got}`);
  }
  return problems.length > 0
    ? { dimension, status: "fail", detail: problems.join("; ") }
    : { dimension, status: "pass", detail: values.join("; ") };
}

function label(pair: Pair, labelled: boolean): string {
  return labelled ? `Work Order ${pair.index + 1}: ` : "";
}

function describeLocation(location: WorkOrderLocation): string {
  return `${location.type === "unit" ? "Unit" : "Common Area"} ${locationId(location)}`;
}

function countWorkOrders(count: number): string {
  return count === 1 ? "1 Work Order" : `${count} Work Orders`;
}
