import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { QUEUE_STATUS_LABELS, formatDate, senderName, type QueueStatus } from "@/console";
import { cn } from "@/lib/utils";
import { loadDemoEntries } from "../data";

export const metadata: Metadata = { title: "Runs · Demo · Fixline" };

const STATUS_STYLES: Record<QueueStatus, string> = {
  pending: "bg-warning text-warning-foreground",
  flagged: "bg-warning text-warning-foreground",
  "auto-applied": "bg-success text-success-foreground",
  "no-action": "bg-muted text-muted-foreground",
  "not-applied": "bg-destructive/10 text-destructive",
  approved: "bg-success text-success-foreground",
  rejected: "bg-muted text-muted-foreground",
  acknowledged: "bg-success text-success-foreground",
};

/** Every recorded run in the Demo workspace. */
export default async function DemoRunsPage() {
  const entries = await loadDemoEntries();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="mt-1 text-muted-foreground">
          Recorded Intake runs. Open one to step through what the agent looked up, what it proposed, and what the
          review rules did with it.
        </p>
        <div className="mt-6 overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-left">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Sender</th>
                <th className="px-4 py-2 font-medium">Outcome</th>
                <th className="px-4 py-2 text-right font-medium">Steps</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="group relative border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    {/* The whole row is the link's click target. */}
                    <Link
                      href={`/console/demo/runs/${entry.id}`}
                      className="font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      {entry.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">{formatDate(entry.message.receivedAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{senderName(entry.message)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[entry.status])}>
                      {QUEUE_STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{entry.trace.steps.length}</td>
                  <td className="max-w-48 truncate px-4 py-3 font-mono text-xs text-muted-foreground">{entry.model}</td>
                  <td className="pr-4 text-muted-foreground">
                    <ChevronRight className="size-4 group-hover:text-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <p className="p-4 text-muted-foreground">No recorded runs yet. See the README for how to add one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
