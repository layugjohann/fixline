import type { Metadata } from "next";
import { IncomingMessagesView } from "./incoming-messages-view";

export const metadata: Metadata = { title: "Incoming Messages · Your sandbox · Fixline" };

export default function SandboxIncomingMessagesPage() {
  return <IncomingMessagesView />;
}
