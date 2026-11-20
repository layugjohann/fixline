import type { Metadata } from "next";
import { loadDemoEntries } from "../data";
import { ReviewQueueView } from "./review-queue-view";

export const metadata: Metadata = { title: "Review Queue · Demo · Fixline" };

export default async function DemoReviewQueuePage() {
  return <ReviewQueueView entries={await loadDemoEntries()} />;
}
