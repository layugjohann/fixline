"use client";

import { createContext, useContext } from "react";
import type { Message, Sender } from "@/domain";
import type { Sandbox } from "@/sandbox";

/** A Coordinator's decision on one Review Queue entry, as the review-queue route takes it. */
export type Decision =
  | { decision: "approve" | "acknowledge" }
  | { decision: "reject"; reason?: string }
  | { decision: "edit"; proposal: unknown };

/** The visitor's sandbox and what they can do with it, shared by the sandbox workspace's pages. */
export interface SandboxWorkspace {
  sandbox: Sandbox;
  /** A request is in flight; the actions are disabled until it finishes. */
  busy: boolean;
  /** The Message Intake is running on, if any. */
  runningMessageId: string | null;
  /** The index (in `sandbox.rejections`) of the last Proposal validation rejected in this visit, if any. */
  latestRejection: number | null;
  /** Runs Intake live on a Message in Incoming Messages. */
  runIntake: (message: Message) => Promise<void>;
  /** Adds a Message from `sender` to Incoming Messages and runs Intake on it. */
  sendAsTenant: (sender: Sender, body: string) => Promise<void>;
  /** Sends a Coordinator's decision; resolves to whether it was accepted. */
  decide: (entryId: string, decision: Decision) => Promise<boolean>;
  openNewMessage: () => void;
}

export const SandboxWorkspaceContext = createContext<SandboxWorkspace | null>(null);

export function useSandboxWorkspace(): SandboxWorkspace {
  const workspace = useContext(SandboxWorkspaceContext);
  if (!workspace) throw new Error("useSandboxWorkspace must be used inside the sandbox workspace.");
  return workspace;
}
