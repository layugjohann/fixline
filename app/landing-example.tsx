"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Link2, Mail, Plus, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { RULE_LABELS, tradeLabel, URGENCY_LABELS } from "@/console";
import type { LandingExample as Example } from "@/console/landing";
import { cn } from "@/lib/utils";
import { locationName } from "./location-name";

const STEP_MS = 1100;
/** How long the finished example stays on screen before it plays again. */
const HOLD_STEPS = 5;

const reducedMotionQuery = () => matchMedia("(prefers-reduced-motion: reduce)");
function subscribeReducedMotion(onChange: () => void) {
  const media = reducedMotionQuery();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const URGENCY_DOT = {
  emergency: "bg-urgency-emergency",
  urgent: "bg-urgency-urgent",
  routine: "bg-urgency-routine",
} as const;

const ROUTING_LABELS = {
  "auto-apply": "Auto-applied to the Board",
  review: "Held for the Review Queue",
  "apply-and-flag": "Applied and flagged as an emergency",
  split: "Emergency applied, the rest held for review",
} as const;

const enter = "animate-in fade-in slide-in-from-bottom-2 duration-500";

/**
 * The hero's animated example: a recorded replay plays out beat by beat, from the messy Message
 * to the Work Orders on the Board. Visitors who prefer reduced motion see it all at once.
 */
export function LandingExample({ example }: { example: Example }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => reducedMotionQuery().matches, () => false);
  const { lookups, workOrders, routing } = example;
  // Beats: the Message, each lookup, each Work Order, then the routing decision.
  const finalBeat = 1 + lookups.length + workOrders.length + (routing ? 1 : 0);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => setBeat((current) => (current >= finalBeat + HOLD_STEPS ? 0 : current + 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, finalBeat]);

  const shown = reducedMotion ? finalBeat : beat;
  const lookupsShown = Math.max(0, Math.min(lookups.length, shown - 1));
  const workOrdersShown = Math.max(0, Math.min(workOrders.length, shown - 1 - lookups.length));
  const routingShown = routing !== undefined && shown >= finalBeat;

  return (
    <figure aria-label={`Recorded run: ${example.title}`} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          Recorded run · {example.title}
        </span>
        {!reducedMotion && (
          <button
            type="button"
            onClick={() => setBeat(0)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-3" aria-hidden />
            Play again
          </button>
        )}
      </figcaption>

      <div className="space-y-3">
        <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Mail className="size-3.5" aria-hidden />
            Message from {example.sender}
          </div>
          <p className="text-sm break-words whitespace-pre-wrap">{example.body}</p>
        </div>

        <ol aria-label="Lookups" className="flex min-h-7 flex-wrap gap-1.5">
          {lookups.slice(0, lookupsShown).map((lookup, index) => (
            <li
              key={index}
              className={cn(enter, "inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs")}
            >
              <Search className="size-3 shrink-0 text-primary" aria-hidden />
              <span className="font-medium">{lookup.label}</span>
              {lookup.detail && <span className="truncate font-mono text-[11px] text-muted-foreground">{lookup.detail}</span>}
            </li>
          ))}
        </ol>

        <ul aria-label="Proposed Work Orders" className="space-y-2">
          {workOrders.slice(0, workOrdersShown).map((workOrder, index) => (
            <li key={index} className={cn(enter, "rounded-xl border bg-background p-3")}>
              {workOrder.kind === "create" ? (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-success-foreground uppercase">
                    <Plus className="size-3" aria-hidden />
                    New Work Order
                  </div>
                  <div className="mt-0.5 font-medium break-words">{workOrder.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className={cn("size-2 rounded-full", URGENCY_DOT[workOrder.urgency])} aria-hidden />
                      {URGENCY_LABELS[workOrder.urgency]}
                    </span>
                    <span>{tradeLabel(workOrder.trade)}</span>
                    <span>{locationName(workOrder.location)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-accent-foreground uppercase">
                    <Link2 className="size-3" aria-hidden />
                    Added to {workOrder.workOrderId}
                  </div>
                  <div className="mt-0.5 font-medium break-words">{workOrder.title}</div>
                  <p className="mt-1 text-xs break-words text-muted-foreground">{workOrder.information}</p>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="min-h-9">
          {routingShown && routing && (
            <div
              className={cn(
                enter,
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs",
                routing.outcome === "auto-apply"
                  ? "border-success-border bg-success text-success-foreground"
                  : "border-warning-border bg-warning text-warning-foreground",
              )}
            >
              {routing.outcome === "auto-apply" ? (
                <CircleCheck className="size-3.5" aria-hidden />
              ) : (
                <ShieldCheck className="size-3.5" aria-hidden />
              )}
              <span className="font-medium">{ROUTING_LABELS[routing.outcome]}</span>
              {routing.rules.length > 0 && <span>· {routing.rules.map((rule) => RULE_LABELS[rule]).join(", ")}</span>}
            </div>
          )}
        </div>
      </div>

      <Link
        href={`/console/demo/runs/${example.replayId}`}
        className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Step through this run&apos;s trace
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </figure>
  );
}
