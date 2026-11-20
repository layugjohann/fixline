import type { Metadata } from "next";
import { ScorecardView } from "../../scorecard-view";
import { loadScorecard } from "../../scorecard-data";

export const metadata: Metadata = { title: "Scorecard · Demo · Fixline" };

/** The eval Scorecard, built from the committed eval runs. */
export default async function DemoScorecardPage() {
  return <ScorecardView data={await loadScorecard()} base="/console/demo" badge="Demo · recorded" />;
}
