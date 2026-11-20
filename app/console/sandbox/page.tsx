import { redirect } from "next/navigation";

/** The sandbox workspace opens on its Incoming Messages. */
export default function SandboxHome() {
  redirect("/console/sandbox/incoming-messages");
}
