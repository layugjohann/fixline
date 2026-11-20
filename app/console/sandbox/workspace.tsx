"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { KeyRound, RotateCcw, SquarePen } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RULE_LABELS, pendingCount, sandboxQueueEntries } from "@/console";
import {
  ProposalSchema,
  ReviewQueueEntrySchema,
  RoutingDecisionSchema,
  TraceSchema,
  WorkOrderSchema,
  type Message,
  type RoutingDecision,
  type Sender,
} from "@/domain";
import { OWN_KEY_PROVIDER_LABELS } from "@/live/own-key";
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
import { ConsoleRail } from "../console-rail";
import { NewMessageForm } from "./new-message-form";
import { Notices, type Notice } from "./notices";
import { OwnKeyForm, type OwnKeyInput } from "./own-key-form";
import { SandboxWorkspaceContext, type Decision, type SandboxWorkspace } from "./sandbox-context";

const BoardAndReviewQueueSchema = z.object({
  board: z.array(WorkOrderSchema),
  reviewQueue: z.array(ReviewQueueEntrySchema),
});

const IntakeResponseSchema = BoardAndReviewQueueSchema.extend({
  proposal: ProposalSchema,
  routing: RoutingDecisionSchema,
  trace: TraceSchema,
  model: z.string().optional(),
});

const DecisionResponseSchema = BoardAndReviewQueueSchema.extend({ conflicts: z.array(z.string()).optional() });

const ErrorResponseSchema = z.object({ error: z.string() });

/** A shared-key live run was refused by live mode's rate limits. */
const LiveRunLimitResponseSchema = z.object({
  error: z.string(),
  liveRunLimit: z.enum(["visitor", "global", "unavailable"]),
});

/** Proposal validation rejected the agent's Proposal: the sandbox is unchanged, and the trace shows why. */
const RejectionResponseSchema = z.object({ error: z.string(), problems: z.array(z.string()), trace: TraceSchema });

/** A Coordinator's edit was refused, with what's wrong with it. */
const ProblemsResponseSchema = z.object({ error: z.string(), problems: z.array(z.string()) });

/** A failed request, with its parsed response body. */
class RequestError extends Error {
  constructor(
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
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
    throw new RequestError(failure.success ? failure.data.error : "The request failed. Try again in a moment.", parsed);
  }
  return parsed;
}

/**
 * The sandbox saved in this browser's storage, or null if there is none. With
 * storage blocked (some privacy settings make even reading it throw), the visitor
 * gets a freshly seeded sandbox for this page instead of a broken page.
 */
function readStoredSandbox(): string | null {
  try {
    return window.localStorage.getItem(SANDBOX_STORAGE_KEY);
  } catch {
    return null;
  }
}

function routingSummary(routing: RoutingDecision): string {
  const rules = routing.rules.map((rule) => RULE_LABELS[rule]).join(" · ");
  switch (routing.outcome) {
    case "review":
      return `Held for review: ${rules}.`;
    case "split":
      return `The emergency is on the Board and flagged; the rest is held for review: ${rules}.`;
    case "apply-and-flag":
      return `Applied to the Board and flagged for a Coordinator: ${rules}.`;
    case "auto-apply":
      return "Applied to the Board without review.";
  }
}

/**
 * The "Your sandbox (live)" workspace. Its state lives in this browser's storage: a first
 * visit seeds it from fixtures, and each request to the server carries the Board and Review
 * Queue it needs and returns them updated. The server keeps nothing.
 */
export function SandboxWorkspaceShell({ children }: { children: ReactNode }) {
  const [sandbox, setSandbox] = useState<Sandbox>(() => loadSandbox(readStoredSandbox()));
  const [busy, setBusy] = useState(false);
  const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
  const [latestRejection, setLatestRejection] = useState<number | null>(null);
  // Deliberately React state only: the key is never written to storage and is gone on reload.
  const [ownKey, setOwnKey] = useState<OwnKeyInput>({ provider: "claude", apiKey: "", modelId: "" });
  const [dialog, setDialog] = useState<"new-message" | "own-key" | "reset" | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextNoticeId = useRef(1);
  // The latest sandbox, for actions that chain requests within one click.
  const current = useRef(sandbox);

  const dismiss = useCallback((id: number) => setNotices((all) => all.filter((notice) => notice.id !== id)), []);

  const notify = useCallback(
    (notice: Omit<Notice, "id">) => {
      const id = nextNoticeId.current++;
      setNotices((all) => [...all.slice(-3), { ...notice, id }]);
      if (notice.tone === "success") window.setTimeout(() => dismiss(id), 8000);
    },
    [dismiss],
  );

  const save = useCallback((next: Sandbox) => {
    current.current = next;
    setSandbox(next);
    try {
      window.localStorage.setItem(SANDBOX_STORAGE_KEY, serialiseSandbox(next));
    } catch {
      // Storage full or blocked: the sandbox still works until the page is reloaded.
    }
  }, []);

  /** Shows why a request failed: live run limits get guidance, anything else a readable error. */
  const reportFailure = useCallback(
    (caught: unknown, title: string) => {
      const body = caught instanceof RequestError ? caught.body : undefined;
      const limit = LiveRunLimitResponseSchema.safeParse(body);
      if (limit.success) {
        notify({
          tone: "warning",
          title: "Live run limit reached",
          body: limit.data.error,
          actions: (
            <>
              <Button size="sm" onClick={() => setDialog("own-key")}>
                <KeyRound /> Use your own key
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/console/demo/review-queue">Open the Demo</Link>
              </Button>
            </>
          ),
        });
        return;
      }
      const problems = ProblemsResponseSchema.safeParse(body);
      notify({
        tone: "error",
        title,
        body: (
          <>
            {caught instanceof Error ? caught.message : "The request failed. Try again in a moment."}
            {problems.success && (
              <ul className="mt-1 list-disc pl-4">
                {problems.data.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            )}
          </>
        ),
      });
    },
    [notify],
  );

  /** Runs Intake live on a Message, against the sandbox's Board and Review Queue. */
  const process = useCallback(
    async (message: Message) => {
      const before = current.current;
      let response: unknown;
      try {
        const apiKey = ownKey.apiKey.trim();
        response = await post("/api/intake", {
          message,
          board: before.board,
          reviewQueue: before.reviewQueue,
          ...(apiKey ? { ownKey: { provider: ownKey.provider, apiKey, modelId: ownKey.modelId.trim() || undefined } } : {}),
        });
      } catch (caught) {
        const rejection = RejectionResponseSchema.safeParse(caught instanceof RequestError ? caught.body : undefined);
        if (!rejection.success) throw caught;
        save(recordRejection(before, { message, problems: rejection.data.problems, trace: rejection.data.trace }));
        setLatestRejection(before.rejections.length);
        notify({
          tone: "error",
          title: "Proposal rejected",
          body: "The agent produced no valid Proposal, so nothing reached the Board or the Review Queue. The Message is still in Incoming Messages; its problems and trace are under Rejected Proposals.",
        });
        return;
      }
      const result = IntakeResponseSchema.parse(response);
      save(recordRun(before, { message, ...result }));
      const reviewed = result.routing.outcome !== "auto-apply";
      notify({
        tone: "success",
        title: result.model ? `Intake ran on ${result.model}` : "Intake ran",
        body: routingSummary(result.routing),
        actions: (
          <Button size="sm" variant="outline" asChild>
            <Link href={reviewed ? "/console/sandbox/review-queue" : "/console/sandbox/board"}>
              {reviewed ? "Open the Review Queue" : "Open the Board"}
            </Link>
          </Button>
        ),
      });
    },
    [notify, ownKey, save],
  );

  const run = useCallback(
    async (messageId: string | null, title: string, action: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setRunningMessageId(messageId);
      try {
        await action();
        return true;
      } catch (caught) {
        reportFailure(caught, title);
        return false;
      } finally {
        setBusy(false);
        setRunningMessageId(null);
      }
    },
    [reportFailure],
  );

  const workspace = useMemo<SandboxWorkspace>(
    () => ({
      sandbox,
      busy,
      runningMessageId,
      latestRejection,
      runIntake: async (message) => {
        await run(message.id, "Intake didn't finish", () => process(message));
      },
      sendAsTenant: async (sender: Sender, body: string) => {
        const sent = sendMessage(current.current, sender, body, new Date().toISOString());
        save(sent.sandbox);
        await run(sent.message.id, "Intake didn't finish", () => process(sent.message));
      },
      decide: (entryId: string, decision: Decision) =>
        run(null, "The decision wasn't saved", async () => {
          const before = current.current;
          const result = DecisionResponseSchema.parse(
            await post("/api/review-queue", {
              ...decision,
              entryId,
              board: before.board,
              reviewQueue: before.reviewQueue,
            }),
          );
          save(recordDecision(before, result));
          if (result.conflicts) {
            notify({
              tone: "warning",
              title: "Back in review",
              body: `The Board changed since this Proposal was made, so it went back to review: ${result.conflicts.join(" ")}`,
            });
          }
        }),
      openNewMessage: () => setDialog("new-message"),
    }),
    [sandbox, busy, runningMessageId, latestRejection, run, process, save, notify],
  );

  function reset() {
    save(seedSandbox());
    setLatestRejection(null);
    setNotices([]);
    setDialog(null);
  }

  const usingOwnKey = ownKey.apiKey.trim() !== "";
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <SandboxWorkspaceContext.Provider value={workspace}>
      <ConsoleRail
        workspace="sandbox"
        pendingCount={pendingCount(sandboxQueueEntries(sandbox))}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New Message"
                onClick={() => setDialog("new-message")}
                className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
              >
                <SquarePen />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New Message · send as a Tenant</TooltipContent>
          </Tooltip>
        }
        menuItems={
          <>
            <DropdownMenuItem onSelect={() => setDialog("own-key")}>
              <KeyRound />
              <span className="flex-1">Your own key…</span>
              <span className="text-xs text-muted-foreground">
                {usingOwnKey ? OWN_KEY_PROVIDER_LABELS[ownKey.provider] : "optional"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("reset")}>
              <RotateCcw /> Reset sandbox…
            </DropdownMenuItem>
          </>
        }
      />
      <main className="flex min-w-0 flex-1">{children}</main>

      <Dialog open={dialog === "new-message"} onOpenChange={close}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Send a Message as a Tenant, or as anyone else, and Intake runs on it straight away
              {usingOwnKey ? ` with your ${OWN_KEY_PROVIDER_LABELS[ownKey.provider]} key` : " on the shared free-tier model"}.
            </DialogDescription>
          </DialogHeader>
          <NewMessageForm
            busy={busy}
            onSend={(sender, body) => {
              setDialog(null);
              void workspace.sendAsTenant(sender, body);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "own-key"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your own key</DialogTitle>
            <DialogDescription>
              Live runs use a shared free-tier model, limited per visitor and per day. Paste your own Claude or OpenAI
              key to run a frontier model with no limit from this demo. Your key is sent only with each live request and
              used for that request alone: it is never saved, logged, or kept in this browser after you leave the page.
            </DialogDescription>
          </DialogHeader>
          <OwnKeyForm ownKey={ownKey} onChange={setOwnKey} disabled={busy} />
          <DialogFooter>
            <Button onClick={() => setDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reset"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your sandbox?</DialogTitle>
            <DialogDescription>
              Your Board, Review Queue, Incoming Messages and run history go back to the start. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reset} disabled={busy}>
              <RotateCcw /> Reset sandbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Notices notices={notices} onDismiss={dismiss} />
    </SandboxWorkspaceContext.Provider>
  );
}
