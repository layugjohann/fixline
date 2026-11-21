import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AgentRun } from "./agent-run";
import { loadEvalTrace } from "@/evals/eval-runs";
import { loadScorecard } from "./scorecard-data";

/** One eval scenario's trace, stepped through in the agent-run view, with its grades. */
export async function ScorecardTrace({ runId, scenarioId, base }: { runId: string; scenarioId: string; base: string }) {
  const data = await loadScorecard();
  const modelIndex = data.models.findIndex((model) => model.runId === runId);
  const model = data.models[modelIndex];
  const row = data.scenarios.find((candidate) => candidate.scenarioId === scenarioId);
  const cell = row?.cells[modelIndex];
  const trace = await loadEvalTrace(runId, scenarioId);
  if (!model || !row || !cell || !trace) notFound();

  const failed = data.dimensions.filter((_, index) => cell.dimensions[index] === "fail");
  const outcome = cell.status === "pass" ? "Passed" : cell.status === "fail" ? "Failed" : "Not graded";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="border-b bg-card px-4 py-4 sm:px-6">
        <Link href={`${base}/scorecard`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Scorecard
        </Link>
        <h1 className="mt-1 font-mono text-lg font-semibold">{row.scenarioId}</h1>
        {row.description && <p className="mt-0.5 max-w-3xl text-muted-foreground">{row.description}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{outcome}</span> on{" "}
          <span className="font-mono">{model.model}</span> · eval run {model.startedAt.slice(0, 10)}
          {failed.length > 0 && <> · failed on {failed.map((dimension) => dimension.label).join(", ")}</>}
        </p>
        {cell.detail && (
          <details className="mt-2 max-w-3xl">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Grader notes
            </summary>
            <p className="mt-2 rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap">{cell.detail}</p>
          </details>
        )}
      </header>
      <AgentRun trace={trace} model={model.model} layout="full" />
    </div>
  );
}
