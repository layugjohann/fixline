"use client";

import { useState } from "react";
import type { Proposal, RoutingDecision, Trace, TraceStep } from "@/domain";
import { locationName } from "./location-name";

const stepBox = { border: "1px solid #ddd", borderRadius: 6, padding: "0.5rem 0.75rem", margin: "0.5rem 0" };
const jsonBlock = {
  background: "#f6f6f6",
  padding: "0.5rem",
  overflowX: "auto" as const,
  fontSize: "0.8rem",
  maxHeight: "16rem",
  margin: "0.25rem 0",
};

/**
 * Shows a trace step by step: model turns, tool calls with their inputs and
 * outputs, the final Proposal and the routing decision. Works for any trace in
 * the shared format, including partial ones (an eval run that ended without a Proposal).
 */
export function TraceViewer({ trace }: { trace: Trace }) {
  const total = trace.steps.length;
  // How many steps are revealed. Starts with the first step shown.
  const [shown, setShown] = useState(Math.min(1, total));

  if (total === 0) return <p>This trace has no steps: the run stopped before the agent did anything.</p>;

  return (
    <section aria-label="Trace">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setShown(Math.min(1, total))} disabled={shown <= 1}>
          ⏮ Restart
        </button>
        <button onClick={() => setShown(shown - 1)} disabled={shown <= 1}>
          ◀ Back
        </button>
        <button onClick={() => setShown(shown + 1)} disabled={shown >= total}>
          Next step ▶
        </button>
        <button onClick={() => setShown(total)} disabled={shown >= total}>
          Show all
        </button>
        <span>
          Step {shown} of {total}
        </span>
      </div>
      <ol style={{ paddingLeft: "1.5rem" }}>
        {trace.steps.slice(0, shown).map((step, index) => (
          <li key={index} style={stepBox}>
            <Step step={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Step({ step }: { step: TraceStep }) {
  switch (step.type) {
    case "model-turn":
      return (
        <>
          <strong>Model turn</strong>
          <p style={{ whiteSpace: "pre-wrap", margin: "0.25rem 0" }}>{step.text}</p>
        </>
      );
    case "tool-call":
      return (
        <>
          <strong>
            Tool call: <code>{step.toolName}</code>
          </strong>
          <div>Input</div>
          <pre style={jsonBlock}>{json(step.input)}</pre>
          <div>Output</div>
          <pre style={jsonBlock}>{json(step.output)}</pre>
        </>
      );
    case "proposal":
      return <ProposalStep proposal={step.proposal} />;
    case "routing":
      return <RoutingStep decision={step.decision} />;
    case "rejection":
      return (
        <>
          <strong>Proposal rejected by validation</strong>
          <p style={{ margin: "0.25rem 0" }}>Nothing reached the Board or the Review Queue.</p>
          <ul>
            {step.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        </>
      );
    case "rejected-tool-call":
      return (
        <>
          <strong>Tool call rejected by the model provider</strong>
          <p style={{ whiteSpace: "pre-wrap", margin: "0.25rem 0" }}>{step.explanation}</p>
        </>
      );
    case "retry":
      return (
        <>
          <strong>
            Retry {step.attempt} of {step.maxRetries}
          </strong>
          <p style={{ margin: "0.25rem 0" }}>
            The model was told what was rejected and why, and given the exact names of its tools.
          </p>
        </>
      );
    default: {
      // Every step type must be rendered: adding one to the trace format breaks this until it is.
      const unhandled: never = step;
      return <pre style={jsonBlock}>{json(unhandled)}</pre>;
    }
  }
}

function ProposalStep({ proposal }: { proposal: Proposal }) {
  return (
    <>
      <strong>Proposal</strong> ({proposal.classification === "maintenance" ? "maintenance" : "not a maintenance matter"})
      <p style={{ margin: "0.25rem 0" }}>{proposal.reasoning}</p>
      {proposal.operations.length === 0 ? (
        <p>No changes to the Board.</p>
      ) : (
        <ul>
          {proposal.operations.map((operation, index) => (
            <li key={index}>
              {operation.type === "create" ? (
                <>
                  Create Work Order <strong>{operation.title}</strong> ({operation.urgency}, {operation.trade},{" "}
                  {locationName(operation.location)})
                  <br />
                  {operation.description}
                </>
              ) : (
                <>
                  Attach to Work Order <strong>{operation.workOrderId}</strong>: {operation.information}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposal.draftReplies.map((reply, index) => (
        <div key={index}>
          Draft Reply ({reply.purpose}), waiting for a Coordinator&apos;s approval:
          <blockquote style={{ whiteSpace: "pre-wrap" }}>{reply.body}</blockquote>
        </div>
      ))}
    </>
  );
}

function RoutingStep({ decision }: { decision: RoutingDecision }) {
  return (
    <>
      <strong>Routing decision: {decision.outcome}</strong>
      <p style={{ margin: "0.25rem 0" }}>{decision.reason}</p>
    </>
  );
}

function json(value: unknown): string {
  return value === undefined ? "(none)" : JSON.stringify(value, null, 2);
}
