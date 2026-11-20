import type { Metadata } from "next";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "Board · Your sandbox · Fixline" };

export default function SandboxBoardPage() {
  return <BoardView />;
}
