import type { ReactNode } from "react";

/**
 * The console's content beside the rail. From `lg` up the panes sit side by side and each scrolls
 * on its own; below it they stack and the whole column scrolls.
 */
export function ConsoleMain({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">{children}</main>
  );
}
