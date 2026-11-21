import { formatPercent, formatRatio, type Ratio, type ScorecardPageData } from "@/console/scorecard";
import { cn } from "@/lib/utils";
import { ScenarioGrid } from "./scenario-grid";

/**
 * The Scorecard: the latest eval run per model side by side, on the README table's dimensions,
 * then every scenario's result per model. Built from the committed eval runs.
 */
export function ScorecardView({ data, base, badge }: { data: ScorecardPageData; base: string; badge: string }) {
  const { models, dimensions } = data;
  const judges = [...new Set(models.flatMap((model) => (model.judge ? [model.judge] : [])))];

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Scorecard</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{badge}</span>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Every model is measured on the same golden scenarios. Scenarios a model provider&apos;s rate limit or another
            non-agent error stopped are not graded, rather than counted as failures.
            {judges.length > 0 && <> Draft Reply quality is judged by {judges.map((judge) => <code key={judge} className="font-mono text-xs">{judge}</code>)}.</>}
          </p>
        </header>

        {models.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            No eval runs yet. Run <code className="font-mono text-xs">npm run eval -- --out eval-runs/&lt;model&gt;</code>{" "}
            and commit the run directory; it appears here on the next build.
          </p>
        ) : (
          <>
            <section aria-labelledby="comparison-heading" className="overflow-x-auto rounded-xl border bg-card">
              <h2 id="comparison-heading" className="sr-only">
                Model comparison
              </h2>
              <table className="w-full min-w-[40rem] text-left">
                <thead className="border-b bg-muted/40 align-top">
                  <tr>
                    <th scope="col" className="w-64 px-4 py-3 text-xs font-medium text-muted-foreground">
                      Dimension
                    </th>
                    {models.map((model) => (
                      <th key={model.model} scope="col" className="px-4 py-3 font-normal">
                        <div className="font-mono text-xs font-semibold break-all text-foreground">{model.model}</div>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[11px] text-muted-foreground">
                          <dt>Run</dt>
                          <dd>
                            <time dateTime={model.startedAt}>{model.startedAt.slice(0, 10)}</time>
                          </dd>
                          <dt>Scenarios</dt>
                          <dd>{model.scenarioCount}</dd>
                          <dt>Judge</dt>
                          <dd className="font-mono break-all">{model.judge ?? "none"}</dd>
                        </dl>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-muted/20">
                    <th scope="row" className="px-4 py-2.5 font-semibold">
                      Scenarios passed
                    </th>
                    {models.map((model) => (
                      <td key={model.model} className="px-4 py-2.5">
                        <Meter ratio={model.scenariosPassed} strong />
                      </td>
                    ))}
                  </tr>
                  {dimensions.map(({ dimension, label }, index) => (
                    <tr key={dimension} className="border-b">
                      <th scope="row" className="px-4 py-2 font-normal">
                        {label}
                      </th>
                      {models.map((model) => (
                        <td key={model.model} className="px-4 py-2">
                          <Meter ratio={model.dimensions[index] ?? { passed: 0, graded: 0, score: null }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-4 py-2 font-normal text-muted-foreground">
                      Not graded (rate limit or error)
                    </th>
                    {models.map((model) => (
                      <td key={model.model} className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {model.notGraded}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </section>

            <ScenarioGrid data={data} base={base} />
          </>
        )}
      </div>
    </div>
  );
}

/** A thin bar for the share passed, with the n/N count beside it. */
function Meter({ ratio, strong = false }: { ratio: Ratio; strong?: boolean }) {
  const label = formatRatio(ratio);
  return (
    <div className="flex items-center gap-3" title={ratio.score === null ? "No scenario graded this dimension" : `${ratio.passed} of ${ratio.graded} graded passed`}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={ratio.graded}
        aria-valuenow={ratio.passed}
        className={cn("h-1.5 w-full max-w-40 overflow-hidden rounded-full", ratio.score === null ? "bg-muted/60" : "bg-muted")}
      >
        {ratio.score !== null && (
          <div className="h-full rounded-full bg-primary" style={{ width: formatPercent(ratio.score) }} />
        )}
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-xs tabular-nums",
          ratio.score === null ? "text-muted-foreground" : "text-foreground",
          strong && "font-semibold",
        )}
      >
        {label}
      </span>
    </div>
  );
}
