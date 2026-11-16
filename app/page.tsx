"use client";

import { useState } from "react";
import { z } from "zod";
import {
  ProposalSchema,
  ReviewQueueEntrySchema,
  RoutingDecisionSchema,
  WorkOrderSchema,
  locationId,
  type ProposalOperation,
  type ReviewQueueEntry,
  type ReviewRule,
  type WorkOrder,
  type WorkOrderLocation,
} from "@/domain";
import { exampleMessages, propertyRoster } from "@/fixtures";

const SandboxSchema = z.object({
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

const IntakeResponseSchema = SandboxSchema.extend({
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
});
type IntakeResponse = z.infer<typeof IntakeResponseSchema>;

const ErrorResponseSchema = z.object({ error: z.string() });

const RULE_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Flagged uncertain",
  "cross-tenant-match": "Matches another Tenant's Work Order",
  "unknown-sender": "Sender not in the Property Roster",
};

function locationName(location: WorkOrderLocation): string {
  for (const property of propertyRoster.properties) {
    if (location.type === "unit") {
      const unit = property.units.find((candidate) => candidate.id === location.unitId);
      if (unit) return `${property.name}, Unit ${unit.label}`;
    } else {
      const commonArea = property.commonAreas.find((candidate) => candidate.id === location.commonAreaId);
      if (commonArea) return `${property.name}, ${commonArea.name}`;
    }
  }
  return locationId(location);
}

function describeOperation(operation: ProposalOperation): string {
  return operation.type === "create"
    ? `Create "${operation.title}" (${operation.urgency}, ${operation.trade}, ${locationName(operation.location)})`
    : `Attach to ${operation.workOrderId} (${operation.matchType}): ${operation.information}`;
}

async function post(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json();
  if (!response.ok) {
    const failure = ErrorResponseSchema.safeParse(parsed);
    throw new Error(failure.success ? failure.data.error : "Request failed.");
  }
  return parsed;
}

export default function Home() {
  // The sandbox Board and Review Queue live in the browser and are sent with every request.
  const [board, setBoard] = useState<WorkOrder[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueEntry[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [last, setLast] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const message = exampleMessages[messageIndex]!;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const runIntake = () =>
    run(async () => {
      const result = IntakeResponseSchema.parse(await post("/api/intake", { message, board, reviewQueue }));
      setBoard(result.board);
      setReviewQueue(result.reviewQueue);
      setLast(result);
    });

  const decide = (entryId: string, decision: "approve" | "reject" | "acknowledge") =>
    run(async () => {
      const result = SandboxSchema.parse(await post("/api/review-queue", { decision, entryId, board, reviewQueue }));
      setBoard(result.board);
      setReviewQueue(result.reviewQueue);
    });

  const waiting = reviewQueue.filter((entry) => entry.status === "pending" || entry.status === "flagged");
  const decided = reviewQueue.filter((entry) => entry.status !== "pending" && entry.status !== "flagged");

  return (
    <main>
      <h1>Fixline</h1>

      <h2>Message</h2>
      <label>
        Example Message:{" "}
        <select value={messageIndex} onChange={(event) => setMessageIndex(Number(event.target.value))}>
          {exampleMessages.map((example, index) => (
            <option key={example.id} value={index}>
              {example.sender.name ?? example.sender.email}: {example.body.slice(0, 50)}…
            </option>
          ))}
        </select>
      </label>
      <p>
        From <strong>{message.sender.name}</strong> &lt;{message.sender.email}&gt;
      </p>
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{message.body}</blockquote>
      <button onClick={runIntake} disabled={busy}>
        {busy ? "Working…" : "Run Intake"}
      </button>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {last && (
        <>
          <h2>Proposal</h2>
          <p>
            Routing: <strong>{last.routing.outcome}</strong> ({last.routing.reason})
          </p>
          <p>{last.proposal.reasoning}</p>
        </>
      )}

      <h2>Review Queue</h2>
      {waiting.length === 0 ? (
        <p>Nothing waiting for a Coordinator.</p>
      ) : (
        <ul>
          {waiting.map((entry) => (
            <ReviewQueueItem key={entry.id} entry={entry} busy={busy} onDecide={decide} />
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <details>
          <summary>Decided ({decided.length})</summary>
          <ul>
            {decided.map((entry) => (
              <ReviewQueueItem key={entry.id} entry={entry} busy={busy} onDecide={decide} />
            ))}
          </ul>
        </details>
      )}

      <h2>Board</h2>
      {board.length === 0 ? (
        <p>No Work Orders yet.</p>
      ) : (
        <ul>
          {board.map((workOrder) => (
            <li key={workOrder.id}>
              <strong>
                {workOrder.id}: {workOrder.title}
              </strong>{" "}
              ({workOrder.urgency}, {workOrder.trade}, {locationName(workOrder.location)})
              <br />
              <span style={{ whiteSpace: "pre-wrap" }}>{workOrder.description}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ReviewQueueItem({
  entry,
  busy,
  onDecide,
}: {
  entry: ReviewQueueEntry;
  busy: boolean;
  onDecide: (entryId: string, decision: "approve" | "reject" | "acknowledge") => void;
}) {
  return (
    <li>
      <strong>
        {entry.id} [{entry.status}]
      </strong>{" "}
      Message from {entry.message.sender.name ?? entry.message.sender.email} &lt;{entry.message.sender.email}&gt;
      <br />
      Sent here by: {entry.routing.rules.map((rule) => RULE_LABELS[rule]).join(", ")}
      <br />
      <em>{entry.routing.reason}</em>
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{entry.message.body}</blockquote>
      {entry.proposal.operations.length === 0 ? (
        <p>Proposal: no changes ({entry.proposal.classification}).</p>
      ) : (
        <ul>
          {entry.proposal.operations.map((operation, index) => (
            <li key={index}>{describeOperation(operation)}</li>
          ))}
        </ul>
      )}
      <p>{entry.proposal.reasoning}</p>
      {entry.status === "pending" && (
        <>
          <button onClick={() => onDecide(entry.id, "approve")} disabled={busy}>
            Approve
          </button>{" "}
          <button onClick={() => onDecide(entry.id, "reject")} disabled={busy}>
            Reject
          </button>
        </>
      )}
      {entry.status === "flagged" && (
        <button onClick={() => onDecide(entry.id, "acknowledge")} disabled={busy}>
          Acknowledge emergency (already on the Board)
        </button>
      )}
    </li>
  );
}
