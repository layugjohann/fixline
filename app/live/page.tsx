"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// The sandbox is read from this browser's storage, so it renders only in the browser.
const SandboxView = dynamic(() => import("./sandbox-view").then((module) => module.SandboxView), {
  ssr: false,
  loading: () => <p>Loading your sandbox…</p>,
});

export default function LivePage() {
  return (
    <main>
      <h1>Fixline: your sandbox</h1>
      <p>
        Live mode runs the agent on a real model against your own sandbox: a Board, Review Queue and Property Roster
        seeded with Harbor Lane&apos;s data, plus an inbox of example Messages. Everything is kept in this browser
        only, so nothing you do affects anyone else. <Link href="/">Back to replay mode</Link>, which needs no model
        or key.
      </p>
      <SandboxView />
    </main>
  );
}
