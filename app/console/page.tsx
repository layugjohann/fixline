import { redirect } from "next/navigation";

/** The console opens on the Demo workspace's Review Queue. */
export default function ConsoleHome() {
  redirect("/console/demo/review-queue");
}
