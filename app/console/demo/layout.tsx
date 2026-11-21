import type { ReactNode } from "react";
import { pendingCount } from "@/console";
import { ConsoleMain } from "../console-main";
import { ConsoleRail } from "../console-rail";
import { loadDemoEntries } from "./data";

/** The Demo workspace: read-only, built from the recorded replays. */
export default async function DemoLayout({ children }: { children: ReactNode }) {
  const entries = await loadDemoEntries();
  return (
    <>
      <ConsoleRail workspace="demo" pendingCount={pendingCount(entries)} />
      <ConsoleMain>{children}</ConsoleMain>
    </>
  );
}
