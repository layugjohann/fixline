"use client";

import { useMemo } from "react";
import { sandboxMessages } from "@/console";
import { sandboxBoardMessages } from "@/fixtures";
import { BoardView } from "../../board-view";
import { useSandboxWorkspace } from "../sandbox-context";

/** The visitor's Board, with the Messages their sandbox holds. */
export function SandboxBoardView() {
  const { sandbox } = useSandboxWorkspace();
  const messages = useMemo(() => sandboxMessages(sandbox, sandboxBoardMessages), [sandbox]);
  return <BoardView board={sandbox.board} messages={messages} badge="Your sandbox · live" />;
}
