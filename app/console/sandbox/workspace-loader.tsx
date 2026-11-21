"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The sandbox is read from this browser's storage, so the workspace renders only in the browser.
const SandboxWorkspaceShell = dynamic(() => import("./workspace").then((module) => module.SandboxWorkspaceShell), {
  ssr: false,
  loading: () => (
    <>
      <div className="h-14 shrink-0 bg-rail lg:h-auto lg:w-16" />
      <p className="m-auto text-muted-foreground">Loading your sandbox…</p>
    </>
  ),
});

export function SandboxWorkspaceLoader({ children }: { children: ReactNode }) {
  return <SandboxWorkspaceShell>{children}</SandboxWorkspaceShell>;
}
