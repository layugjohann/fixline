"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ProposalSchema,
  ReviewQueueEntrySchema,
  RoutingDecisionSchema,
  TraceSchema,
  WorkOrderSchema,
  type DraftReplyPurpose,
  type Message,
  type ProposalOperation,
  type ReviewQueueEntry,
  type ReviewRule,
} from "@/domain";
import { propertyRoster } from "@/fixtures";
import {
  SANDBOX_STORAGE_KEY,
  loadSandbox,
  recordDecision,
  recordRejection,
  recordRun,
  seedSandbox,
  sendMessage,
  serialiseSandbox,
  type Sandbox,
} from "@/sandbox";
import { locationName } from "../location-name";
import { TraceViewer } from "../trace-viewer";

const BoardAndReviewQueueSchema = z.object({
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

const IntakeResponseSchema = BoardAndReviewQueueSchema.extend({
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  trace: TraceSchema,
});

const ErrorResponseSchema = z.object({ error: z.string() });

/** Proposal validation rejected the agent's Proposal: the sandbox is unchanged, and the trace shows why. */
const RejectionResponseSchema = z.object({ error: z.string(), problems: z.array(z.string()), trace: TraceSchema });

const DecisionResponseSchema = BoardAndReviewQueueSchema.extend({ conflicts: z.array(z.string()).optional() });

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

/** The "send as Tenant" form's choice for a Sender who isn't in the Property Roster. */
const NEW_SENDER = "new-sender";

function describeOperation(operation: ProposalOperation): string {
  return operation.type === "create"
    ? `Create "${operation.title}" (${operation.urgency}, ${operation.trade}, ${locationName(operation.location)})`
    : `Attach to ${operation.workOrderId} (${operation.matchType}): ${operation.information}`;
}

function senderName(message: Message): string {
  return message.sender.name ?? message.sender.email;
}

async function post(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = ErrorResponseSchema.safeParse(parsed);
    throw new RequestError(failure.success ? failure.data.error : "Request failed.", parsed);
  }
  return parsed;
}

/**
 * The visitor's sandbox. Its state lives in this browser's storage: a first visit
 * seeds it from fixtures, and each request to the server carries the Board and
 * Review Queue it needs and returns them updated. The server keeps nothing.
 */
export function SandboxView() {
  const [sandbox, setSandbox] = useState<Sandbox>(() => loadSandbox(window.localStorage.getItem(SANDBOX_STORAGE_KEY)));
  // Which run in the history the trace viewer shows; the latest by default.
  const [shownRun, setShownRun] = useState<number | null>(null);
  // Set when the latest run's Proposal was rejected by validation, so its trace is shown.
  const [latestRejected, setLatestRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function save(next: Sandbox) {
    setSandbox(next);
    try {
      window.localStorage.setItem(SANDBOX_STORAGE_KEY, serialiseSandbox(next));
    } catch {
      // Storage full or blocked: the sandbox still works until the page is reloaded.
    }
  }

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

  /** Runs Intake live on a Message, against this sandbox's Board and Review Queue. */
  async function process(current: Sandbox, message: Message) {
    let response: unknown;
    try {
      response = await post("/api/intake", { message, board: current.board, reviewQueue: current.reviewQueue });
    } catch (caught) {
      const rejection = caught instanceof RequestError ? RejectionResponseSchema.safeParse(caught.body) : undefined;
      if (!rejection?.success) throw caught;
      save(recordRejection(current, { message, problems: rejection.data.problems, trace: rejection.data.trace }));
      setLatestRejected(true);
      return;
    }
    save(recordRun(current, { message, ...IntakeResponseSchema.parse(response) }));
    setShownRun(null);
    setLatestRejected(false);
  }

  const processMessage = (message: Message) => run(() => process(sandbox, message));

  const sendAsTenant = (sender: { email: string; name?: string }, body: string) =>
    run(async () => {
      const sent = sendMessage(sandbox, sender, body, new Date().toISOString());
      save(sent.sandbox);
      await process(sent.sandbox, sent.message);
    });

  const decide = (entryId: string, decision: Decision) =>
    run(async () => {
      const result = DecisionResponseSchema.parse(
        await post("/api/review-queue", {
          ...decision,
          entryId,
          board: sandbox.board,
          reviewQueue: sandbox.reviewQueue,
        }),
      );
      save(recordDecision(sandbox, result));
      if (result.conflicts) {
        setError(`The Board changed since this Proposal was made, so it went back to review: ${result.conflicts.join(" ")}`);
      }
    });

  function reset() {
    if (!window.confirm("Reset your sandbox? Your Board, Review Queue, inbox and history go back to the start.")) return;
    save(seedSandbox());
    setShownRun(null);
    setLatestRejected(false);
    setError(null);
  }

  const runIndex = shownRun ?? sandbox.history.length - 1;
  const shown = sandbox.history[runIndex];
  const latestRejection = latestRejected ? sandbox.rejections.at(-1) : undefined;
  const waiting = sandbox.reviewQueue.filter((entry) => entry.status === "pending" || entry.status === "flagged");
  const decided = sandbox.reviewQueue.filter((entry) => entry.status !== "pending" && entry.status !== "flagged");
  const unprocessed = sandbox.inbox.filter((item) => !item.processed);
  const processed = sandbox.inbox.filter((item) => item.processed);

  return (
    <>
      <p>
        <button onClick={reset} disabled={busy}>
          Reset sandbox
        </button>
      </p>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      <h2>Inbox</h2>
      {unprocessed.length === 0 ? (
        <p>Every Message has been processed. Send your own below, or reset the sandbox.</p>
      ) : (
        <ul>
          {unprocessed.map(({ message }) => (
            <li key={message.id}>
              From <strong>{senderName(message)}</strong> &lt;{message.sender.email}&gt;
              <blockquote style={{ whiteSpace: "pre-wrap" }}>{message.body}</blockquote>
              <button onClick={() => processMessage(message)} disabled={busy}>
                {busy ? "Working…" : "Process with Intake"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {processed.length > 0 && (
        <details>
          <summary>Processed ({processed.length})</summary>
          <ul>
            {processed.map(({ message }) => (
              <li key={message.id}>
                From <strong>{senderName(message)}</strong>: {message.body}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>Send a Message as a Tenant</h2>
      <SendAsTenantForm busy={busy} onSend={sendAsTenant} />

      {latestRejection && (
        <>
          <h2>Proposal rejected</h2>
          <p>
            Proposal validation rejected the agent&apos;s Proposal for {senderName(latestRejection.message)}&apos;s
            Message, so nothing reached the Board or the Review Queue. The Message is still in the inbox.
          </p>
          <ul>
            {latestRejection.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
          <h2>Trace</h2>
          <TraceViewer key={`rejection-${sandbox.rejections.length}`} trace={latestRejection.trace} />
        </>
      )}

      {shown && !latestRejection && (
        <>
          <h2>Proposal</h2>
          {sandbox.history.length > 1 && (
            <label>
              Run:{" "}
              <select value={runIndex} onChange={(event) => setShownRun(Number(event.target.value))}>
                {sandbox.history.map((record, index) => (
                  <option key={index} value={index}>
                    {index + 1}. {senderName(record.message)}: {record.message.body.slice(0, 40)}… ({record.routing.outcome})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p>
            Message from <strong>{senderName(shown.message)}</strong>. Routing: <strong>{shown.routing.outcome}</strong> (
            {shown.routing.reason})
          </p>
          {shown.routing.outcome === "split" && (
            <p>
              Split: the emergency Work Order is already on the Board and flagged; the rest of the Proposal is pending
              in the Review Queue.
            </p>
          )}
          {shown.proposal.operations.length === 0 ? (
            <p>No changes ({shown.proposal.classification}).</p>
          ) : (
            <ul>
              {shown.proposal.operations.map((operation, index) => (
                <li key={index}>{describeOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p>{shown.proposal.reasoning}</p>
          <h2>Trace</h2>
          <TraceViewer key={runIndex} trace={shown.trace} />
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

      {sandbox.rejections.length > 0 && (
        <details>
          <summary>Rejected by validation ({sandbox.rejections.length})</summary>
          <ul>
            {sandbox.rejections.map((rejection, index) => (
              <li key={index}>
                Message from {senderName(rejection.message)}: {rejection.problems.join(" ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>Board</h2>
      {sandbox.board.length === 0 ? (
        <p>No Work Orders yet.</p>
      ) : (
        <ul>
          {sandbox.board.map((workOrder) => (
            <li key={workOrder.id}>
              <strong>
                {workOrder.id}: {workOrder.title}
              </strong>{" "}
              ({workOrder.status}, {workOrder.urgency}, {workOrder.trade}, {locationName(workOrder.location)})
              <br />
              <span style={{ whiteSpace: "pre-wrap" }}>{workOrder.description}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Property Roster</h2>
      <PropertyRosterView />
    </>
  );
}

function SendAsTenantForm({
  busy,
  onSend,
}: {
  busy: boolean;
  onSend: (sender: { email: string; name?: string }, body: string) => void;
}) {
  const [choice, setChoice] = useState(propertyRoster.tenants[0]?.id ?? NEW_SENDER);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const tenant = propertyRoster.tenants.find((candidate) => candidate.id === choice);
  const ready = body.trim() !== "" && (tenant !== undefined || email.trim() !== "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSend(tenant ? { email: tenant.email, name: tenant.name } : { email, name }, body);
    setBody("");
  }

  return (
    <form onSubmit={submit}>
      <p>
        <label>
          Sender:{" "}
          <select value={choice} onChange={(event) => setChoice(event.target.value)}>
            {propertyRoster.tenants.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({locationName({ type: "unit", unitId: candidate.unitId })})
              </option>
            ))}
            <option value={NEW_SENDER}>Someone not in the Property Roster…</option>
          </select>
        </label>
      </p>
      {!tenant && (
        <p>
          <label>
            Email:{" "}
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>{" "}
          <label>
            Name (optional): <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </p>
      )}
      <p>
        <label>
          Message:
          <br />
          <textarea
            rows={4}
            style={{ width: "100%" }}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="The heater is dead AGAIN and the kitchen tap drips…"
          />
        </label>
      </p>
      <button type="submit" disabled={busy || !ready}>
        {busy ? "Working…" : "Send and process with Intake"}
      </button>
    </form>
  );
}

function PropertyRosterView() {
  return (
    <details>
      <summary>Properties, Units, Common Areas and Tenants (read-only)</summary>
      {propertyRoster.properties.map((property) => (
        <div key={property.id}>
          <h3>
            {property.name}, {property.address}
          </h3>
          <ul>
            {property.units.map((unit) => (
              <li key={unit.id}>
                Unit {unit.label}:{" "}
                {propertyRoster.tenants
                  .filter((tenant) => tenant.unitId === unit.id)
                  .map((tenant) => `${tenant.name} <${tenant.email}>`)
                  .join(", ") || "no Tenant listed"}
              </li>
            ))}
            <li>Common Areas: {property.commonAreas.map((commonArea) => commonArea.name).join(", ")}</li>
          </ul>
        </div>
      ))}
    </details>
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
      Message from {senderName(entry.message)} &lt;{entry.message.sender.email}&gt;
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
