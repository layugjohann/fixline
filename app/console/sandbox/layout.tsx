import type { ReactNode } from "react";
import { SandboxWorkspaceLoader } from "./workspace-loader";

/** The "Your sandbox (live)" workspace: the visitor's own Board and Review Queue, kept in their browser. */
export default function SandboxLayout({ children }: { children: ReactNode }) {
  return <SandboxWorkspaceLoader>{children}</SandboxWorkspaceLoader>;
}
