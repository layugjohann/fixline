import type { Metadata } from "next";
import { SandboxBoardView } from "./board-view";

export const metadata: Metadata = { title: "Board · Your sandbox · Fixline" };

export default function SandboxBoardPage() {
  return <SandboxBoardView />;
}
