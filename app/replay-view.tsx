"use client";

import { useState } from "react";
import type { Replay } from "@/replays";
import { locationName } from "./location-name";
import { TraceViewer } from "./trace-viewer";

/** Replay mode: pick a recorded run and step through its trace. No model, no key. */
export function ReplayView({ replays }: { replays: Replay[] }) {
  const [selectedId, setSelectedId] = useState(replays[0]?.id);
  const replay = replays.find((candidate) => candidate.id === selectedId);

  if (!replay) return <p>No recorded replays yet. See the README for how to turn a saved trace into one.</p>;

  return (
    <>
      <label>
        Recorded run:{" "}
        <select value={replay.id} onChange={(event) => setSelectedId(event.target.value)}>
          {replays.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      {replay.description && <p>{replay.description}</p>}
      <p style={{ fontSize: "0.85rem", color: "#555" }}>
        Model: {replay.model}
        {replay.recordedAt && <> · recorded {replay.recordedAt}</>}
      </p>

      <h2>Message</h2>
      <p>
        From <strong>{replay.message.sender.name ?? replay.message.sender.email}</strong> &lt;
        {replay.message.sender.email}&gt;, {replay.message.receivedAt}
      </p>
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{replay.message.body}</blockquote>

      <details>
        <summary>Board before the run ({replay.board.length} Work Orders)</summary>
        <ul>
          {replay.board.map((workOrder) => (
            <li key={workOrder.id}>
              <strong>
                {workOrder.id}: {workOrder.title}
              </strong>{" "}
              ({workOrder.status}, {workOrder.urgency}, {workOrder.trade}, {locationName(workOrder.location)})
            </li>
          ))}
        </ul>
      </details>

      <h2>Agent run</h2>
      {/* Keyed by replay so switching runs starts the new trace from its first step. */}
      <TraceViewer key={replay.id} trace={replay.trace} />
    </>
  );
}
