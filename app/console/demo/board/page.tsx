import type { Metadata } from "next";
import { sandboxBoard, sandboxBoardMessages } from "@/fixtures";
import { BoardView } from "../../board-view";

export const metadata: Metadata = { title: "Board · Demo · Fixline" };

/** The Demo's Board: the seeded Board every sandbox starts from, read-only. */
export default function DemoBoardPage() {
  return <BoardView board={sandboxBoard} messages={sandboxBoardMessages} badge="Demo · recorded" />;
}
