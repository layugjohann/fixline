import Link from "next/link";
import { loadReplays } from "@/replays/files";
import { ReplayView } from "./replay-view";

/**
 * The landing view: replay mode. Recorded replays are read from replays/ when the
 * page is built and shipped as static data, so it makes no model calls and needs no key.
 */
export default async function Home() {
  const replays = await loadReplays();
  return (
    <main>
      <h1>Fixline</h1>
      <p>
        An AI intake agent for Harbor Lane Property Management. It reads a Tenant&apos;s Message, looks things up, and
        proposes Work Orders; fixed rules decide what happens to the Proposal. Step through a recorded run below.
      </p>
      <p>
        <strong>Replay mode</strong> · <Link href="/live">Live mode</Link> ·{" "}
        {/* A full page load, so the console's styles never reach this page. */}
        <a href="/console">Open the console</a>
      </p>
      <ReplayView replays={replays} />
    </main>
  );
}
