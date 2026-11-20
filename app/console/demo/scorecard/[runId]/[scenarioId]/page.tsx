import type { Metadata } from "next";
import { ScorecardTrace } from "../../../../scorecard-trace";
import { scorecardTraceParams } from "../../../../scorecard-data";

/** Every eval trace is built when the site is; there are no others. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return scorecardTraceParams();
}

type Params = { params: Promise<{ runId: string; scenarioId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { scenarioId } = await params;
  return { title: `${scenarioId} · Scorecard · Fixline` };
}

/** One eval scenario's trace. */
export default async function DemoScorecardTracePage({ params }: Params) {
  const { runId, scenarioId } = await params;
  return <ScorecardTrace runId={runId} scenarioId={scenarioId} base="/console/demo" />;
}
