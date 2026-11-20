import type { ReactNode } from "react";
import { pendingCount } from "@/console";
import { ConsoleRail } from "../console-rail";
import { loadDemoEntries } from "./data";

/** The Demo workspace: read-only, built from the recorded replays. */
export default async function DemoLayout({ children }: { children: ReactNode }) {
  const entries = await loadDemoEntries();
  return (
    <>
      <ConsoleRail workspace="demo" pendingCount={pendingCount(entries)} />
      <main className="flex min-w-0 flex-1">{children}</main>
    </>
  );
}
