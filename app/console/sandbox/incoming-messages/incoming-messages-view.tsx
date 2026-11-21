"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, CircleX, Inbox, Play, SquarePen, User, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, initials, senderName } from "@/console";
import type { Message } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { cn } from "@/lib/utils";
import { AgentRun } from "../../agent-run";
import { locationName } from "../../../location-name";
import { useSandboxWorkspace } from "../sandbox-context";

/**
 * The sandbox's Incoming Messages: Messages waiting for Intake, each with "Run Intake", the
 * processed ones collapsed, and the Proposals validation rejected with their problems and trace.
 */
export function IncomingMessagesView() {
  const { sandbox, busy, runningMessageId, latestRejection, runIntake, openNewMessage } = useSandboxWorkspace();
  // Which rejection's trace the rail shows: "none" once closed, otherwise the chosen one or the latest of this visit.
  const [shownRejection, setShownRejection] = useState<number | "none" | null>(null);
  const shownIndex = shownRejection === "none" ? null : (shownRejection ?? latestRejection);
  const shown = shownIndex === null ? undefined : sandbox.rejections[shownIndex];

  const unprocessed = sandbox.incomingMessages.filter((item) => !item.processed);
  const processed = sandbox.incomingMessages.filter((item) => item.processed);

  return (
    <>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
          <header className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Incoming Messages</h1>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Your sandbox · live
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Messages that haven&apos;t been through Intake yet. Run Intake to have the agent turn one into a Proposal
                on a real model; everything stays in this browser.
              </p>
            </div>
            <Button variant="outline" onClick={openNewMessage}>
              <SquarePen /> New Message
            </Button>
          </header>

          <section aria-labelledby="unprocessed-heading" className="space-y-3">
            <h2 id="unprocessed-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Waiting for Intake <span className="font-mono">{unprocessed.length}</span>
            </h2>
            {unprocessed.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                <Inbox className="size-6" />
                <p>Every Message has been through Intake. Send your own with New Message, or reset the sandbox from the workspace menu.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {unprocessed.map(({ message }) => (
                  <li key={message.id}>
                    <MessageCard message={message}>
                      <Button size="sm" onClick={() => void runIntake(message)} disabled={busy}>
                        <Play /> {runningMessageId === message.id ? "Running Intake…" : "Run Intake"}
                      </Button>
                    </MessageCard>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sandbox.rejections.length > 0 && (
            <section aria-labelledby="rejections-heading" className="space-y-3">
              <h2 id="rejections-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rejected Proposals <span className="font-mono">{sandbox.rejections.length}</span>
              </h2>
              <p className="text-muted-foreground">
                The agent produced no valid Proposal for these (Proposal validation rejected it, or the model provider
                rejected the model&apos;s tool calls), so nothing reached the Board or the Review Queue. The Messages stay
                above, ready to run again.
              </p>
              <ul className="space-y-2">
                {sandbox.rejections
                  .map((rejection, index) => ({ rejection, index }))
                  .reverse()
                  .map(({ rejection, index }) => (
                    <li key={index}>
                      <article
                        aria-label={`Rejected Proposal for ${senderName(rejection.message)}`}
                        className={cn(
                          "rounded-xl border border-destructive/30 bg-card p-4",
                          index === shownIndex && "ring-2 ring-destructive/40",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {senderName(rejection.message)}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {formatDateTime(rejection.message.receivedAt)}
                              </span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{rejection.message.body}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                              {rejection.problems.map((problem, problemIndex) => (
                                <li key={problemIndex}>{problem}</li>
                              ))}
                            </ul>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-pressed={index === shownIndex}
                            onClick={() => setShownRejection(index === shownIndex ? "none" : index)}
                          >
                            {index === shownIndex ? "Hide trace" : "Show trace"}
                          </Button>
                        </div>
                      </article>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {processed.length > 0 && (
            <details className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium select-none">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                Processed <span className="font-mono text-muted-foreground">{processed.length}</span>
              </summary>
              <ul className="space-y-2 border-t p-3">
                {processed.map(({ message }) => (
                  <li key={message.id}>
                    <MessageCard message={message} compact />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {shown && shownIndex !== null && (
        <AgentRun key={`rejection-${shownIndex}`} trace={shown.trace} model="Live run" layout="rail" startAt="last" />
      )}
    </>
  );
}

function MessageCard({ message, compact = false, children }: { message: Message; compact?: boolean; children?: ReactNode }) {
  const name = senderName(message);
  const tenant = propertyRoster.tenants.find((candidate) => candidate.email === message.sender.email);
  return (
    <article aria-label={`Message from ${name}`} className={cn("rounded-xl bg-card ring-1 ring-border", compact ? "p-3" : "p-4 shadow-sm")}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {tenant ? (
              <>
                <User className="size-3" /> {message.sender.email} · {locationName({ type: "unit", unitId: tenant.unitId })}
              </>
            ) : (
              <>
                <UserX className="size-3 text-warning-foreground" /> {message.sender.email} · not in the Property Roster
              </>
            )}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(message.receivedAt)}</span>
      </div>
      <p className={cn("mt-3 leading-relaxed whitespace-pre-wrap", compact && "line-clamp-2 text-muted-foreground")}>{message.body}</p>
      {children && <div className="mt-3 flex justify-end">{children}</div>}
    </article>
  );
}
