import { redirect } from "next/navigation";

/** Live mode is now the console's sandbox workspace. */
export default function LivePage() {
  redirect("/console/sandbox/incoming-messages");
}
