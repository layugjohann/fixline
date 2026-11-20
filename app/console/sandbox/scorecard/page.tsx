import type { Metadata } from "next";
import { ScorecardView } from "../../scorecard-view";
import { loadScorecard } from "../../scorecard-data";

export const metadata: Metadata = { title: "Scorecard · Your sandbox · Fixline" };

/** The eval Scorecard, built from the committed eval runs. */
export default async function SandboxScorecardPage() {
  return <ScorecardView data={await loadScorecard()} base="/console/sandbox" badge="Your sandbox · live" />;
}
