import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Fixline console",
};

/** The console takes the whole window. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="fixed inset-0 flex bg-background font-sans text-sm text-foreground antialiased">{children}</div>
    </TooltipProvider>
  );
}
