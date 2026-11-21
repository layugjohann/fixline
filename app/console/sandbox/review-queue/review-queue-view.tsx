"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, Check, CircleCheck, Eye, Pencil, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUEUE_STATUS_LABELS,
  formatDateTime,
  queueTab,
  sandboxQueueEntries,
  type QueueTab,
  type SandboxEntry,
} from "@/console";
import { AGENT_RUN_RAIL_CLASS, AgentRun } from "../../agent-run";
import { Conversation, Kbd, QueuePane } from "../../review-queue-panes";
import { useSandboxWorkspace, type SandboxWorkspace } from "../sandbox-context";

const TAB_LABELS: Record<QueueTab, string> = { "to-review": "To review", "auto-handled": "Auto-handled / decided" };

/** The sandbox's Review Queue: the Demo's three panes, with a working decision bar. */
export function ReviewQueueView() {
  const workspace = useSandboxWorkspace();
  const entries = sandboxQueueEntries(workspace.sandbox);
  const [tab, setTab] = useState<QueueTab>("to-review");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const visible = entries.filter((entry) => queueTab(entry.status) === tab);
  // A decided entry moves to the other tab, so the next one in this tab is selected instead.
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];

  return (
    <>
      <QueuePane
        badge="Your sandbox · live"
        tabLabels={TAB_LABELS}
        entries={entries}
        tab={tab}
        onTabChange={setTab}
        selectedId={selected?.id}
        onSelect={setSelectedId}
      />

      {selected ? (
        <>
          <Conversation
            key={selected.id}
            entry={selected}
            notes={<EntryNotes entry={selected} />}
            draftReplyStatus={draftReplyStatus(selected)}
            footer={<DecisionBar entry={selected} workspace={workspace} />}
          />
          {selected.trace ? (
            <AgentRun key={`run-${selected.id}`} trace={selected.trace} model="Live run" layout="rail" startAt="last" />
          ) : (
            <section aria-label="Agent run" className={AGENT_RUN_RAIL_CLASS}>
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Activity className="size-4 text-primary" />
                <h2 className="font-semibold">Agent run</h2>
              </div>
              <p className="p-4 text-muted-foreground">
                This entry came with your sandbox, so there is no run to step through. Run Intake on a Message to see one.
              </p>
            </section>
          )}
        </>
      ) : (
        <p className="m-auto text-muted-foreground">
          {tab === "to-review" ? "Nothing waiting for a Coordinator." : "Nothing handled or decided yet."}
        </p>
      )}
    </>
  );
}

function draftReplyStatus(entry: SandboxEntry): string {
  if (entry.draftRepliesSentAt) {
    return `marked as sent ${formatDateTime(entry.draftRepliesSentAt)} (sandbox only, nothing was actually sent)`;
  }
  if (entry.status === "rejected") return "not sent";
  return "not sent until approved";
}

function EntryNotes({ entry }: { entry: SandboxEntry }) {
  return (
    <>
      {entry.conflicts && entry.status === "pending" && (
        <div role="status" className="flex gap-2 rounded-lg border border-warning-border bg-warning px-4 py-3 text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Back in review:</strong> the Board changed since this Proposal was made. {entry.conflicts.join(" ")}
          </p>
        </div>
      )}
      {entry.agentProposal && (
        <p className="text-xs text-muted-foreground">
          <Pencil className="mr-1 inline size-3" />
          Edited by a Coordinator: the Proposal below replaces the agent&apos;s.
        </p>
      )}
      {entry.status === "rejected" && (
        <p className="rounded-lg bg-muted px-4 py-3 text-muted-foreground">
          Rejected{entry.rejectionReason ? `: ${entry.rejectionReason}` : " with no reason given"}.
        </p>
      )}
    </>
  );
}

/** Approve & apply (or Acknowledge), Edit and Reject, with the A / E / R shortcuts. */
function DecisionBar({ entry, workspace }: { entry: SandboxEntry; workspace: SandboxWorkspace }) {
  const { busy, decide } = workspace;
  const [dialog, setDialog] = useState<"edit" | "reject" | null>(null);
  const entryId = entry.reviewEntryId;
  const decidable = entryId !== undefined && (entry.status === "pending" || entry.status === "flagged");
  const flagged = entry.status === "flagged";

  // The shortcuts call the latest handlers, without re-subscribing on every render.
  const shortcuts = useRef<Record<string, () => void>>({});
  useEffect(() => {
    const keys: Record<string, () => void> = {};
    if (decidable && !busy && entryId) {
      keys.a = () => void decide(entryId, { decision: flagged ? "acknowledge" : "approve" });
      if (!flagged) {
        keys.e = () => setDialog("edit");
        keys.r = () => setDialog("reject");
      }
    }
    shortcuts.current = keys;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      if (document.querySelector("[role=dialog]")) return;
      const action = shortcuts.current[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!decidable || !entryId) {
    return (
      <footer className="flex items-center gap-2 border-t bg-card px-4 py-3 sm:px-6 text-muted-foreground">
        <CircleCheck className="size-4 text-primary" />
        {QUEUE_STATUS_LABELS[entry.status]}
        {queueTab(entry.status) === "auto-handled" && entry.reviewEntryId === undefined
          ? ": no Coordinator action needed."
          : ": a Coordinator has decided."}
      </footer>
    );
  }

  const draftReplies = entry.proposal?.draftReplies.length ?? 0;
  return (
    <footer aria-label="Decision" className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3 sm:px-6">
      <Button
        disabled={busy}
        aria-keyshortcuts="A"
        onClick={() => void decide(entryId, { decision: flagged ? "acknowledge" : "approve" })}
      >
        {flagged ? <Eye /> : <Check />} {flagged ? "Acknowledge" : "Approve & apply"} <Kbd>A</Kbd>
      </Button>
      {!flagged && (
        <>
          <Button variant="outline" disabled={busy} aria-keyshortcuts="E" onClick={() => setDialog("edit")}>
            <Pencil /> Edit <Kbd>E</Kbd>
          </Button>
          <Button variant="ghost" disabled={busy} aria-keyshortcuts="R" onClick={() => setDialog("reject")}>
            <X /> Reject <Kbd>R</Kbd>
          </Button>
        </>
      )}
      <p className="ml-auto text-xs text-muted-foreground">
        {busy
          ? "Working…"
          : flagged
            ? "Already on the Board: acknowledge that you've seen it."
            : draftReplies > 0
              ? `Approving marks ${draftReplies === 1 ? "the Draft Reply" : "the Draft Replies"} as sent (nothing is actually sent).`
              : "Approving applies the Proposal to your Board."}
      </p>

      {!flagged && (
        <>
          <EditDialog
            key={`edit-${entryId}-${dialog === "edit"}`}
            open={dialog === "edit"}
            entry={entry}
            busy={busy}
            onClose={() => setDialog(null)}
            onSave={async (proposal) => {
              if (await decide(entryId, { decision: "edit", proposal })) setDialog(null);
            }}
          />
          <RejectDialog
            key={`reject-${entryId}-${dialog === "reject"}`}
            open={dialog === "reject"}
            busy={busy}
            onClose={() => setDialog(null)}
            onReject={async (reason) => {
              if (await decide(entryId, { decision: "reject", reason: reason || undefined })) setDialog(null);
            }}
          />
        </>
      )}
    </footer>
  );
}

/** The existing edit flow: the Proposal as JSON, validated by the server like the agent's. */
function EditDialog({
  open,
  entry,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  entry: SandboxEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (proposal: unknown) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(entry.proposal, null, 2));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    let edited: unknown;
    try {
      edited = JSON.parse(draft);
    } catch {
      setProblem("The edited Proposal isn't valid JSON.");
      return;
    }
    setProblem(null);
    void onSave(edited);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit the Proposal</DialogTitle>
            <DialogDescription>
              Change the operations, Urgency, Trade or Draft Replies, then save. The edit is checked like the agent&apos;s
              Proposal and stays in the Review Queue for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-proposal">Proposal (JSON)</Label>
            <Textarea
              id="edit-proposal"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={18}
              spellCheck={false}
              aria-invalid={problem !== null}
              className="max-h-[55vh] font-mono text-xs [field-sizing:fixed]"
            />
            {problem && (
              <p role="alert" className="text-xs text-destructive">
                {problem}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save edit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  open,
  busy,
  onClose,
  onReject,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onReject: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onReject(reason.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject the Proposal?</DialogTitle>
            <DialogDescription>Nothing is applied to the Board, and any Draft Replies are not sent.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rejection-reason">Reason (optional)</Label>
            <Textarea id="rejection-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              <X /> Reject
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
