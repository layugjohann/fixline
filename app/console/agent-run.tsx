"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  ChevronFirst,
  ChevronLast,
  CircleCheck,
  CircleX,
  ListChecks,
  RotateCcw,
  SkipBack,
  SkipForward,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DRAFT_REPLY_LABELS,
  RULE_LABELS,
  URGENCY_LABELS,
  describeStep,
  prettyJson,
  toolLabel,
  tradeLabel,
  type StepKind,
} from "@/console";
import type { Proposal, Trace, TraceStep } from "@/domain";
import { cn } from "@/lib/utils";
import { locationName } from "../location-name";

const STEP_ICONS: Record<StepKind, ReactNode> = {
  "model-turn": <Bot />,
  "tool-call": <Terminal />,
  proposal: <ListChecks />,
  routing: <CircleCheck />,
  rejection: <CircleX />,
  retry: <RotateCcw />,
};

const STEP_TONES: Record<StepKind, string> = {
  "model-turn": "text-primary",
  "tool-call": "text-sky-600 dark:text-sky-400",
  proposal: "text-success-foreground",
  routing: "text-warning-foreground",
  rejection: "text-destructive",
  retry: "text-muted-foreground",
};

/**
 * Steps through an agent run like a debugger: the step list, with later steps dimmed, and the
 * selected step's detail (a tool call's input and output, the Proposal, the routing decision,
 * rejections and retries). Works for any trace in the shared format, including partial ones.
 *
 * `rail` is the narrow column beside the Review Queue's conversation; `full` is the Runs page.
 */
export function AgentRun({
  trace,
  model,
  layout,
  startAt = "first",
}: {
  trace: Trace;
  model: string;
  layout: "rail" | "full";
  startAt?: "first" | "last";
}) {
  const total = trace.steps.length;
  const [current, setCurrent] = useState(startAt === "first" ? 0 : Math.max(0, total - 1));
  const step = trace.steps[current];
  const goTo = (index: number) => setCurrent(Math.min(Math.max(index, 0), total - 1));

  useEffect(() => {
    if (layout !== "full") return;
    // On the Runs page, ← and → step through the run.
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight") setCurrent((index) => Math.min(index + 1, total - 1));
      if (event.key === "ArrowLeft") setCurrent((index) => Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, total]);

  const header = (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-primary" />
        <h2 className="shrink-0 font-semibold">Agent run</h2>
        <span className="ml-auto max-w-[60%] truncate font-mono text-xs text-muted-foreground" title={model}>
          {model}
        </span>
      </div>
      {total > 0 && (
        <div className="mt-3 flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="First step" onClick={() => goTo(0)} disabled={current === 0}>
            <ChevronFirst />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Previous step" onClick={() => goTo(current - 1)} disabled={current === 0}>
            <SkipBack />
          </Button>
          <div className="mx-1 h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((current + 1) / total) * 100}%` }} />
          </div>
          <Button variant="outline" size="icon-sm" aria-label="Next step" onClick={() => goTo(current + 1)} disabled={current === total - 1}>
            <SkipForward />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Last step" onClick={() => goTo(total - 1)} disabled={current === total - 1}>
            <ChevronLast />
          </Button>
          <span className="ml-1 shrink-0 font-mono text-xs text-muted-foreground" aria-live="polite">
            Step {current + 1} of {total}
          </span>
        </div>
      )}
    </div>
  );

  if (total === 0 || !step) {
    return (
      <section aria-label="Agent run" className={cn("flex flex-col", layout === "rail" ? "w-[380px] shrink-0 border-l bg-card/50" : "flex-1")}>
        {header}
        <p className="p-4 text-muted-foreground">This run has no steps: it stopped before the agent did anything.</p>
      </section>
    );
  }

  const stepList = (
    <ol className="space-y-0.5 p-2" aria-label="Steps">
      {trace.steps.map((traceStep, index) => {
        const { kind, label, detail } = describeStep(traceStep);
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => setCurrent(index)}
              aria-current={index === current ? "step" : undefined}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index === current
                  ? "bg-card shadow-sm ring-1 ring-border"
                  : index > current
                    ? "opacity-45 hover:opacity-80"
                    : "hover:bg-card/60",
              )}
            >
              <span className="w-5 shrink-0 pt-px text-right font-mono text-[11px] text-muted-foreground">{index + 1}</span>
              <span className={cn("mt-0.5 [&_svg]:size-3.5", STEP_TONES[kind])}>{STEP_ICONS[kind]}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{label}</span>
                <span className={cn("block truncate text-xs text-muted-foreground", kind === "tool-call" && "font-mono")}>
                  {detail}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  if (layout === "rail") {
    return (
      <section aria-label="Agent run" className="flex w-[380px] shrink-0 flex-col border-l bg-muted/40">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{stepList}</div>
        <div className="max-h-[50%] shrink-0 overflow-y-auto border-t p-3">
          <StepDetail step={step} compact />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Agent run" className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,26rem)_1fr]">
        <div className="overflow-y-auto border-r bg-muted/40">{stepList}</div>
        <div className="overflow-y-auto p-6">
          <StepDetail step={step} />
        </div>
      </div>
    </section>
  );
}

/** Everything about one trace step. */
export function StepDetail({ step, compact = false }: { step: TraceStep; compact?: boolean }) {
  const title = (text: ReactNode) => <h3 className="mb-2 font-semibold">{text}</h3>;

  switch (step.type) {
    case "model-turn":
      return (
        <div>
          {title("Model turn")}
          <p className="leading-relaxed whitespace-pre-wrap text-foreground/90">{step.text}</p>
        </div>
      );
    case "tool-call":
      return (
        <div>
          {title(
            <>
              Tool call: {toolLabel(step.toolName)} <code className="ml-1 font-mono text-xs font-normal text-muted-foreground">{step.toolName}</code>
            </>,
          )}
          <div className="rounded-lg bg-code p-3 font-mono text-[11px] text-code-foreground">
            <div className="mb-1 opacity-60">→ input</div>
            <pre className={cn("overflow-auto", compact ? "max-h-28" : "max-h-72")}>{prettyJson(step.input)}</pre>
            <div className="mt-3 mb-1 opacity-60">← output</div>
            <pre className={cn("overflow-auto", compact ? "max-h-48" : "max-h-[28rem]")}>{prettyJson(step.output)}</pre>
          </div>
        </div>
      );
    case "proposal":
      return (
        <div>
          {title("Proposal submitted")}
          <ProposalSummary proposal={step.proposal} />
        </div>
      );
    case "routing":
      return (
        <div>
          {title(`Routing decision: ${step.decision.outcome}`)}
          <p className="text-foreground/90">{step.decision.reason}</p>
          {step.decision.rules.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {step.decision.rules.map((rule) => (
                <li key={rule} className="rounded-md bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground ring-1 ring-warning-border">
                  {RULE_LABELS[rule]}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "rejection":
      return (
        <div>
          {title("Proposal rejected by validation")}
          <p className="mb-2 text-muted-foreground">Nothing reached the Board or the Review Queue.</p>
          <ul className="list-disc space-y-1 pl-5 text-destructive">
            {step.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        </div>
      );
    case "rejected-tool-call":
      return (
        <div>
          {title("Tool call rejected by the model provider")}
          <p className="whitespace-pre-wrap text-foreground/90">{step.explanation}</p>
        </div>
      );
    case "retry":
      return (
        <div>
          {title(`Retry ${step.attempt} of ${step.maxRetries}`)}
          <p className="text-foreground/90">
            The model was told what was rejected and why, and given the exact names of its tools.
          </p>
        </div>
      );
    default: {
      // Every step type must be shown: adding one to the trace format breaks this until it is.
      const unhandled: never = step;
      return <pre className="font-mono text-xs">{prettyJson(unhandled)}</pre>;
    }
  }
}

function ProposalSummary({ proposal }: { proposal: Proposal }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground italic">“{proposal.reasoning}”</p>
      {proposal.classification === "not-maintenance" ? (
        <p>Not a maintenance matter: no changes to the Board.</p>
      ) : (
        <ul className="space-y-1.5">
          {proposal.operations.map((operation, index) => (
            <li key={index} className="rounded-md border bg-card px-3 py-2">
              {operation.type === "create" ? (
                <>
                  <span className="font-medium">Create:</span> {operation.title}
                  <span className="block text-xs text-muted-foreground">
                    {URGENCY_LABELS[operation.urgency]} · {tradeLabel(operation.trade)} · {locationName(operation.location)}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">Attach to {operation.workOrderId}:</span> {operation.information}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposal.uncertain && <p className="text-warning-foreground">The agent marked this Proposal as unsure.</p>}
      {proposal.draftReplies.map((reply, index) => (
        <div key={index} className="rounded-md border-2 border-dashed border-primary/40 bg-accent px-3 py-2 text-accent-foreground">
          <span className="block text-xs font-medium">Draft Reply · {DRAFT_REPLY_LABELS[reply.purpose]}</span>
          <span className="whitespace-pre-wrap">{reply.body}</span>
        </div>
      ))}
    </div>
  );
}
