"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleCheck, Eye, Info, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUEUE_STATUS_LABELS, queueTab, type DemoEntry, type QueueTab } from "@/console";
import { AgentRun } from "../../agent-run";
import { Conversation, Kbd, QueuePane } from "../../review-queue-panes";

const TAB_LABELS: Record<QueueTab, string> = { "to-review": "To review", "auto-handled": "Auto-handled" };

/** The Demo workspace's Review Queue: queue pane, conversation pane and agent-run rail. Read-only. */
export function ReviewQueueView({ entries }: { entries: DemoEntry[] }) {
  const [tab, setTab] = useState<QueueTab>("to-review");
  const [selectedId, setSelectedId] = useState<string | undefined>(
    (entries.find((entry) => queueTab(entry.status) === "to-review") ?? entries[0])?.id,
  );
  const visible = entries.filter((entry) => queueTab(entry.status) === tab);
  // Switching tabs selects the first entry there, so the panes never show an entry that isn't listed.
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];

  return (
    <>
      <QueuePane
        badge="Demo · recorded"
        tabLabels={TAB_LABELS}
        entries={entries}
        tab={tab}
        onTabChange={setTab}
        selectedId={selected?.id}
        onSelect={setSelectedId}
      />

      {selected ? (
        <>
          <Conversation key={selected.id} entry={selected} footer={<DecisionBar entry={selected} />} />
          <AgentRun key={`run-${selected.id}`} trace={selected.trace} model={selected.model} layout="rail" startAt="last" />
        </>
      ) : (
        <p className="m-auto text-muted-foreground">
          {entries.length === 0 ? "No recorded replays yet. See the README for how to add one." : "Nothing here."}
        </p>
      )}
    </>
  );
}

/** The Coordinator's decisions, shown but disabled: the Demo is read-only. */
function DecisionBar({ entry }: { entry: DemoEntry }) {
  if (queueTab(entry.status) === "auto-handled") {
    return (
      <footer className="flex items-center gap-2 border-t bg-card px-4 py-3 sm:px-6 text-muted-foreground">
        <CircleCheck className="size-4 text-primary" />
        {QUEUE_STATUS_LABELS[entry.status]}: no Coordinator action needed.
      </footer>
    );
  }

  const flagged = entry.status === "flagged";
  return (
    <footer aria-label="Decision" className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3 sm:px-6">
      <Button disabled>
        {flagged ? <Eye /> : <Check />} {flagged ? "Acknowledge" : "Approve & apply"} <Kbd>A</Kbd>
      </Button>
      {!flagged && (
        <>
          <Button variant="outline" disabled>
            <Pencil /> Edit <Kbd>E</Kbd>
          </Button>
          <Button variant="ghost" disabled>
            <X /> Reject <Kbd>R</Kbd>
          </Button>
        </>
      )}
      <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        Read-only demo: open{" "}
        <Link href="/console/sandbox/review-queue" className="font-medium text-primary underline-offset-2 hover:underline">
          your sandbox
        </Link>{" "}
        to decide
      </p>
    </footer>
  );
}
