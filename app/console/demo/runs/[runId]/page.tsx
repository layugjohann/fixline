import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDateTime, senderName } from "@/console";
import { AgentRun } from "../../../agent-run";
import { loadDemoEntries } from "../../data";

/** Every run is built when the site is; there are no others. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadDemoEntries()).map((entry) => ({ runId: entry.id }));
}

type Params = { params: Promise<{ runId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { runId } = await params;
  const entry = (await loadDemoEntries()).find((candidate) => candidate.id === runId);
  return { title: `${entry?.title ?? "Run"} · Runs · Fixline` };
}

/** One recorded run, stepped through full width. */
export default async function DemoRunPage({ params }: Params) {
  const { runId } = await params;
  const entry = (await loadDemoEntries()).find((candidate) => candidate.id === runId);
  if (!entry) notFound();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="border-b bg-card px-6 py-4">
        <Link href="/console/demo/runs" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> All runs
        </Link>
        <h1 className="mt-1 text-lg font-semibold">{entry.title}</h1>
        {entry.description && <p className="mt-0.5 max-w-3xl text-muted-foreground">{entry.description}</p>}
        <details className="mt-3 max-w-3xl">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Message from {senderName(entry.message)} · {formatDateTime(entry.message.receivedAt)}
          </summary>
          <p className="mt-2 rounded-xl bg-muted px-4 py-3 leading-relaxed whitespace-pre-wrap">{entry.message.body}</p>
        </details>
      </header>
      <AgentRun trace={entry.trace} model={entry.model} layout="full" />
    </div>
  );
}
