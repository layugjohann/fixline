"use client";

import { URGENCY_LABELS, tradeLabel } from "@/console";
import { cn } from "@/lib/utils";
import { locationName } from "../../../location-name";
import { useSandboxWorkspace } from "../sandbox-context";

/** The sandbox's Board: every Work Order, most urgent first, closed ones last. */
export function BoardView() {
  const { sandbox } = useSandboxWorkspace();
  const order = { emergency: 0, urgent: 1, routine: 2 } as const;
  const workOrders = [...sandbox.board].sort(
    (a, b) => Number(a.status === "closed") - Number(b.status === "closed") || order[a.urgency] - order[b.urgency],
  );

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        <header className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Board</h1>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Your sandbox · live</span>
        </header>
        {workOrders.length === 0 ? (
          <p className="text-muted-foreground">No Work Orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <table aria-label="Board" className="w-full text-left">
              <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Work Order</th>
                  <th className="px-4 py-2 font-medium">Urgency</th>
                  <th className="px-4 py-2 font-medium">Trade</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((workOrder) => (
                  <tr key={workOrder.id} className={cn("border-b align-top last:border-0", workOrder.status === "closed" && "opacity-60")}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{workOrder.id}</span>
                      <span className="block font-medium">{workOrder.title}</span>
                      <span className="block max-w-xl text-xs whitespace-pre-wrap text-muted-foreground">{workOrder.description}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{URGENCY_LABELS[workOrder.urgency]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{tradeLabel(workOrder.trade)}</td>
                    <td className="px-4 py-3">{locationName(workOrder.location)}</td>
                    <td className="px-4 py-3 capitalize">{workOrder.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
