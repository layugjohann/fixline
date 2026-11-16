"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import {
  ProposalSchema,
  ReviewQueueEntrySchema,
  RoutingDecisionSchema,
  TraceSchema,
  WorkOrderSchema,
  type DraftReplyPurpose,
  type ProposalOperation,
  type ReviewQueueEntry,
  type ReviewRule,
  type WorkOrder,
} from "@/domain";
import { exampleMessages } from "@/fixtures";
import { locationName } from "../location-name";
import { TraceViewer } from "../trace-viewer";

const SandboxSchema = z.object({
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

const IntakeResponseSchema = SandboxSchema.extend({
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  trace: TraceSchema,
});
type IntakeResponse = z.infer<typeof IntakeResponseSchema>;

const ErrorResponseSchema = z.object({ error: z.string() });

/** Proposal validation rejected the agent's Proposal: the sandbox is unchanged, and the trace shows why. */
const RejectionResponseSchema = z.object({ error: z.string(), problems: z.array(z.string()), trace: TraceSchema });
type Rejection = z.infer<typeof RejectionResponseSchema>;

const DecisionResponseSchema = SandboxSchema.extend({ conflicts: z.array(z.string()).optional() });

type Decision =
  | { decision: "approve" | "acknowledge" }
  | { decision: "reject"; reason?: string }
  | { decision: "edit"; proposal: unknown };

/** A failed request, with its parsed response body. */
class RequestError extends Error {
  constructor(
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

const RULE_LABELS: Record<ReviewRule, string> = {
  emergency: "Emergency",
  uncertain: "Flagged uncertain",
  "cross-tenant-match": "Matches another Tenant's Work Order",
  "unknown-sender": "Sender not in the Property Roster",
  "draft-reply": "Includes a Draft Reply",
};

const DRAFT_REPLY_PURPOSE_LABELS: Record<DraftReplyPurpose, string> = {
  "missing-unit": "asks for the missing Unit",
  "unit-mismatch": "asks the Sender to confirm their Unit",
  "emergency-confirmation": "confirms an emergency",
};

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
    throw new RequestError(failure.success ? failure.data.error : "Request failed.", parsed);
  }
  return parsed;
}

export default function LivePage() {
  // The sandbox Board and Review Queue live in the browser and are sent with every request.
  const [board, setBoard] = useState<WorkOrder[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueEntry[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [last, setLast] = useState<IntakeResponse | null>(null);
  // Proposals that Proposal validation rejected. They never reached the Board or the Review Queue.
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [lastRejection, setLastRejection] = useState<Rejection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Counts completed runs, so each new trace starts from its first step.
  const [runs, setRuns] = useState(0);

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
      try {
        const result = IntakeResponseSchema.parse(await post("/api/intake", { message, board, reviewQueue }));
        setBoard(result.board);
        setReviewQueue(result.reviewQueue);
        setLast(result);
        setLastRejection(null);
      } catch (caught) {
        const rejection = caught instanceof RequestError ? RejectionResponseSchema.safeParse(caught.body) : undefined;
        if (!rejection?.success) throw caught;
        setRejections((previous) => [...previous, rejection.data]);
        setLastRejection(rejection.data);
        setLast(null);
      } finally {
        setRuns((count) => count + 1);
      }
    });

  const decide = (entryId: string, decision: Decision) =>
    run(async () => {
      const result = DecisionResponseSchema.parse(
        await post("/api/review-queue", { ...decision, entryId, board, reviewQueue }),
      );
      setBoard(result.board);
      setReviewQueue(result.reviewQueue);
      if (result.conflicts) {
        setError(`The Board changed since this Proposal was made, so it went back to review: ${result.conflicts.join(" ")}`);
      }
    });

  const waiting = reviewQueue.filter((entry) => entry.status === "pending" || entry.status === "flagged");
  const decided = reviewQueue.filter((entry) => entry.status !== "pending" && entry.status !== "flagged");

  return (
    <main>
      <h1>Fixline: live mode</h1>
      <p>
        Runs the agent on a real model. <Link href="/">Back to replay mode</Link>, which needs no model or key.
      </p>

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
          {last.routing.outcome === "split" && (
            <p>
              Split: the emergency Work Order is already on the Board and flagged; the rest of the Proposal is
              pending in the Review Queue.
            </p>
          )}
          <p>{last.proposal.reasoning}</p>
          <h2>Trace</h2>
          <TraceViewer key={runs} trace={last.trace} />
        </>
      )}

      {lastRejection && (
        <>
          <h2>Proposal rejected</h2>
          <p>Proposal validation rejected the agent&apos;s Proposal, so nothing reached the Board or the Review Queue.</p>
          <ul>
            {lastRejection.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
          <h2>Trace</h2>
          <TraceViewer key={runs} trace={lastRejection.trace} />
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

      {rejections.length > 0 && (
        <details>
          <summary>Rejected by validation ({rejections.length})</summary>
          <ul>
            {rejections.map((rejection, index) => (
              <li key={index}>
                Message {rejection.trace.messageId}: {rejection.problems.join(" ")}
              </li>
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
  onDecide: (entryId: string, decision: Decision) => void;
}) {
  // The Coordinator's edit of the Proposal, as JSON, while they are editing it.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  function saveEdit() {
    if (draft === null) return;
    let edited: unknown;
    try {
      edited = JSON.parse(draft);
    } catch {
      setDraftError("The edited Proposal isn't valid JSON.");
      return;
    }
    setDraftError(null);
    setDraft(null);
    onDecide(entry.id, { decision: "edit", proposal: edited });
  }

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
      {entry.conflicts && entry.status === "pending" && (
        <p role="status" style={{ color: "darkorange" }}>
          Back in review: the Board changed since this Proposal was made. {entry.conflicts.join(" ")}
        </p>
      )}
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{entry.message.body}</blockquote>
      {entry.agentProposal && <p>Edited by a Coordinator.</p>}
      {entry.proposal.operations.length === 0 ? (
        <p>Proposal: no changes to the Board ({entry.proposal.classification}).</p>
      ) : (
        <ul>
          {entry.proposal.operations.map((operation, index) => (
            <li key={index}>{describeOperation(operation)}</li>
          ))}
        </ul>
      )}
      {entry.proposal.draftReplies.map((reply, index) => (
        <div key={index}>
          <p>
            Draft Reply to {entry.message.sender.email} ({DRAFT_REPLY_PURPOSE_LABELS[reply.purpose]}):{" "}
            <strong>
              {entry.draftRepliesSentAt
                ? `marked as sent ${entry.draftRepliesSentAt} (sandbox only, nothing was actually sent)`
                : entry.status === "rejected"
                  ? "not sent"
                  : "waiting for approval"}
            </strong>
          </p>
          <blockquote style={{ whiteSpace: "pre-wrap" }}>{reply.body}</blockquote>
        </div>
      ))}
      <p>{entry.proposal.reasoning}</p>
      {entry.status === "rejected" && entry.rejectionReason && <p>Rejected: {entry.rejectionReason}</p>}
      {entry.status === "pending" && draft !== null && (
        <>
          <label>
            Edit the Proposal (operations, Urgency, Trade, labels):
            <br />
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={16}
              cols={80}
              style={{ fontFamily: "monospace" }}
            />
          </label>
          {draftError && <p style={{ color: "crimson" }}>{draftError}</p>}
          <br />
          <button onClick={saveEdit} disabled={busy}>
            Save edit
          </button>{" "}
          <button onClick={() => setDraft(null)} disabled={busy}>
            Cancel
          </button>
        </>
      )}
      {entry.status === "pending" && draft === null && (
        <>
          <button onClick={() => onDecide(entry.id, { decision: "approve" })} disabled={busy}>
            {entry.proposal.draftReplies.length > 0 ? "Approve and mark Draft Replies as sent" : "Approve"}
          </button>{" "}
          <button onClick={() => setDraft(JSON.stringify(entry.proposal, null, 2))} disabled={busy}>
            Edit
          </button>{" "}
          <input
            aria-label="Reason for rejecting"
            placeholder="Reason for rejecting (optional)"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
          />{" "}
          <button onClick={() => onDecide(entry.id, { decision: "reject", reason: rejectionReason })} disabled={busy}>
            Reject
          </button>
        </>
      )}
      {entry.status === "flagged" && (
        <button onClick={() => onDecide(entry.id, { decision: "acknowledge" })} disabled={busy}>
          Acknowledge emergency (already on the Board)
        </button>
      )}
    </li>
  );
}
