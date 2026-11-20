"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, CircleMinus, CircleSlash, CircleX } from "lucide-react";
import type { CellStatus, ScenarioCell, ScorecardPageData } from "@/console/scorecard";
import type { Dimension } from "@/evals/graders";
import { cn } from "@/lib/utils";

type Shown = CellStatus | "skip";

const CELL_STYLES: Record<Shown, { label: string; icon: React.ReactNode; className: string }> = {
  pass: { label: "Pass", icon: <CircleCheck />, className: "bg-success text-success-foreground" },
  fail: { label: "Fail", icon: <CircleX />, className: "bg-destructive/10 text-destructive" },
  "not-graded": { label: "Not graded", icon: <CircleSlash />, className: "bg-muted text-muted-foreground" },
  skip: { label: "Doesn't apply", icon: <CircleMinus />, className: "text-muted-foreground" },
};

/**
 * Every scenario's result per model: overall, or on one dimension. A cell opens that eval run's
 * trace for the scenario, when the run kept one.
 */
export function ScenarioGrid({ data, base }: { data: ScorecardPageData; base: string }) {
  const [view, setView] = useState<"overall" | Dimension>("overall");
  const dimensionIndex = data.dimensions.findIndex((candidate) => candidate.dimension === view);
  const shown = (cell: ScenarioCell): Shown => (view === "overall" ? cell.status : (cell.dimensions[dimensionIndex] ?? "not-graded"));

  return (
    <section aria-labelledby="scenarios-heading" className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="mr-auto">
          <h2 id="scenarios-heading" className="font-semibold">
            By scenario
          </h2>
          <p className="text-xs text-muted-foreground">Open a result to step through that eval run&apos;s trace.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Show
          <select
            value={view}
            onChange={(event) => {
              const value = event.target.value;
              const dimension = data.dimensions.find((candidate) => candidate.dimension === value);
              setView(dimension ? dimension.dimension : "overall");
            }}
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="overall">Overall result</option>
            {data.dimensions.map(({ dimension, label }) => (
              <option key={dimension} value={dimension}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Scenario
              </th>
              {data.models.map((model) => (
                <th key={model.model} scope="col" className="px-4 py-2 font-mono font-medium break-all">
                  {model.model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((row) => (
              <tr key={row.scenarioId} className="border-b last:border-0">
                <th scope="row" className="max-w-md px-4 py-2 font-normal">
                  <div className="font-mono text-xs font-medium">{row.scenarioId}</div>
                  {row.description && <div className="text-xs text-muted-foreground">{row.description}</div>}
                </th>
                {row.cells.map((cell, index) => {
                  const model = data.models[index]?.model ?? "";
                  return (
                    <td key={model} className="px-4 py-2">
                      <Cell cell={cell} status={shown(cell)} base={base} label={`${row.scenarioId} on ${model}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        {(["pass", "fail", "not-graded", "skip"] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1 [&_svg]:size-3.5">
            {CELL_STYLES[status].icon} {CELL_STYLES[status].label}
          </span>
        ))}
      </p>
    </section>
  );
}

function Cell({ cell, status, base, label }: { cell: ScenarioCell; status: Shown; base: string; label: string }) {
  const style = CELL_STYLES[status];
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5",
    style.className,
  );
  const content = (
    <>
      {style.icon}
      {style.label}
    </>
  );
  if (!cell.trace) {
    return (
      <span className={className} title={cell.detail}>
        {content}
      </span>
    );
  }
  const href = `${base}/scorecard/${encodeURIComponent(cell.trace.runId)}/${encodeURIComponent(cell.trace.scenarioId)}`;
  return (
    <Link
      href={href}
      title={cell.detail}
      aria-label={`${label}: ${style.label}. Open the trace`}
      className={cn(className, "outline-none hover:ring-1 hover:ring-current focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {content}
    </Link>
  );
}
