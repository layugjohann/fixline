import { redirect } from "next/navigation";

/** The old live mode URL: it opens the console's sandbox workspace. */
export default function LivePage() {
  redirect("/console/sandbox/incoming-messages");
}
