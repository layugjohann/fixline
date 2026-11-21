"use client";

import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A toast: what a live run or decision did, or why it didn't happen. */
export interface Notice {
  id: number;
  tone: "success" | "warning" | "error";
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}

const TONES: Record<Notice["tone"], { icon: ReactNode; className: string }> = {
  success: { icon: <CircleCheck className="text-primary" />, className: "border-border" },
  warning: { icon: <TriangleAlert className="text-warning-foreground" />, className: "border-warning-border" },
  error: { icon: <CircleAlert className="text-destructive" />, className: "border-destructive/40" },
};

/** The workspace's toasts, newest at the bottom. Errors and limits stay until dismissed. */
export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  return (
    <section aria-label="Notifications" className="pointer-events-none fixed right-4 bottom-4 left-4 z-40 flex flex-col gap-2 sm:left-auto sm:w-96">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role={notice.tone === "success" ? "status" : "alert"}
          className={cn(
            "pointer-events-auto flex gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
            TONES[notice.tone].className,
          )}
        >
          {TONES[notice.tone].icon}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{notice.title}</p>
            {notice.body && <div className="mt-0.5 text-[13px] text-muted-foreground">{notice.body}</div>}
            {notice.actions && <div className="mt-2 flex flex-wrap gap-2">{notice.actions}</div>}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(notice.id)}
            className="grid size-6 shrink-0 place-items-center rounded opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
          >
            <X />
          </button>
        </div>
      ))}
    </section>
  );
}
