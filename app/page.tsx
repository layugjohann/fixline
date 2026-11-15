"use client";

import { useState } from "react";
import { z } from "zod";
import {
  ProposalSchema,
  RoutingDecisionSchema,
  WorkOrderSchema,
  locationId,
  type WorkOrder,
  type WorkOrderLocation,
} from "@/domain";
import { propertyRoster, tracerMessage } from "@/fixtures";

const IntakeResponseSchema = z.object({
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  board: z.array(WorkOrderSchema),
});
type IntakeResponse = z.infer<typeof IntakeResponseSchema>;

const ErrorResponseSchema = z.object({ error: z.string() });

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

export default function Home() {
  // The sandbox Board lives in the browser and is sent with every request.
  const [board, setBoard] = useState<WorkOrder[]>([]);
  const [last, setLast] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runIntake() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: tracerMessage, board }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = ErrorResponseSchema.safeParse(body);
        throw new Error(failure.success ? failure.data.error : "Intake failed.");
      }
      const result = IntakeResponseSchema.parse(body);
      setBoard(result.board);
      setLast(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Intake failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <h1>Fixline</h1>

      <h2>Message</h2>
      <p>
        From <strong>{tracerMessage.sender.name}</strong> &lt;{tracerMessage.sender.email}&gt;
      </p>
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{tracerMessage.body}</blockquote>
      <button onClick={runIntake} disabled={running}>
        {running ? "Running Intake…" : "Run Intake"}
      </button>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {last && (
        <>
          <h2>Proposal</h2>
          <p>
            Routing: <strong>{last.routing.outcome}</strong> ({last.routing.reason})
          </p>
          <p>{last.proposal.reasoning}</p>
        </>
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
              {workOrder.description}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
