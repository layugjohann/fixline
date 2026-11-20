import type { Metadata } from "next";
import { ReviewQueueView } from "./review-queue-view";

export const metadata: Metadata = { title: "Review Queue · Your sandbox · Fixline" };

export default function SandboxReviewQueuePage() {
  return <ReviewQueueView />;
}
