import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  FlaskConical,
  Inbox,
  KanbanSquare,
  ListChecks,
  Mail,
  PlayCircle,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPercent, formatRatio } from "@/console/scorecard";
import { landingExample, pickLandingReplay } from "@/console/landing";
import { loadReplays } from "@/replays/files";
import { loadScorecard } from "./console/scorecard-data";
import { LandingExample } from "./landing-example";

const GITHUB_URL = "https://github.com/layugjohann/fixline";
/** The demo video's link lives in the README until it is published. */
const VIDEO_URL = `${GITHUB_URL}#readme`;

const DEMO_HREF = "/console/demo/review-queue";
const SANDBOX_HREF = "/console/sandbox/incoming-messages";
const SCORECARD_HREF = "/console/demo/scorecard";

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Human review, by rules",
    body: "Fixed rules decide what a Coordinator must see: emergencies, unknown Senders, matches to another Tenant's Work Order, Draft Replies, anything the agent marks as unsure. Never a confidence score.",
  },
  {
    icon: <FlaskConical className="size-5" />,
    title: "Evals, not vibes",
    body: "Every model is graded on the same golden scenarios, dimension by dimension, with rule-based graders and an LLM judge only for Draft Reply quality.",
  },
  {
    icon: <PlayCircle className="size-5" />,
    title: "Replayable traces",
    body: "Every run records each model turn, lookup, Proposal and routing decision in one trace format, so live runs, eval runs and recordings all step through the same viewer.",
  },
];

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <Mail className="size-4" />, title: "Message", body: "A Tenant writes in, as messily as they like." },
  { icon: <Search className="size-4" />, title: "Lookups", body: "The agent checks the Property Roster and the open Work Orders. Read-only." },
  { icon: <ClipboardCheck className="size-4" />, title: "Proposal", body: "It proposes Work Orders to create or update, and any Draft Replies." },
  { icon: <ListChecks className="size-4" />, title: "Review rules", body: "Fixed rules auto-apply it or hold it for a Coordinator." },
  { icon: <KanbanSquare className="size-4" />, title: "Board", body: "Approved changes land on the Board, by Urgency." },
];

/**
 * The landing page. The animated example is a recorded replay and the Scorecard teaser reads
 * the committed eval runs, both when the page is built, so it makes no model calls.
 */
export default async function Home() {
  const replay = pickLandingReplay(await loadReplays());
  const example = replay ? landingExample(replay) : undefined;
  const scorecard = await loadScorecard();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Fixline</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={SCORECARD_HREF}>Scorecard</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={GITHUB_URL}>GitHub</a>
          </Button>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-heading" className="mx-auto grid max-w-6xl gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:pt-16">
          <div className="min-w-0">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Inbox className="size-3.5" aria-hidden />
              Maintenance intake for Harbor Lane Property Management
            </p>
            <h1 id="hero-heading" className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              An AI agent that turns messy tenant messages into triaged Work Orders.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">
              Fixline reads a Tenant&apos;s Message, looks things up, and proposes Work Orders. Fixed rules decide what goes
              straight to the Board and what a Coordinator reviews first. Every run is evaluated and replayable.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={DEMO_HREF}>
                  Open the Demo
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={SANDBOX_HREF}>Open your sandbox</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The Demo is recorded runs, with no model and no key. Your sandbox runs the agent live on a free-tier model.
            </p>
          </div>
          {example && <LandingExample example={example} />}
        </section>

        <section aria-labelledby="features-heading" className="border-y bg-card/50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
              Built like a product, measured like one
            </h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="rounded-xl border bg-card p-5">
                  <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden>
                    {feature.icon}
                  </span>
                  <h3 className="mt-3 font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="scorecard-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="scorecard-heading" className="text-2xl font-semibold tracking-tight">
                Scorecard
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                The latest eval run per model, on the same golden scenarios.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={SCORECARD_HREF}>
                See the full Scorecard
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          {scorecard.models.length === 0 ? (
            <p className="mt-6 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              No eval runs are committed yet. Results appear here, and on the Scorecard page, after the next build.
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scorecard.models.map((model) => (
                <li key={model.model} className="min-w-0 rounded-xl border bg-card p-5">
                  <div className="font-mono text-xs font-semibold break-all">{model.model}</div>
                  <div className="mt-3 text-3xl font-semibold tabular-nums">
                    {model.scenariosPassed.score === null ? "–" : formatPercent(model.scenariosPassed.score)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Scenarios passed: {formatRatio(model.scenariosPassed)}
                    {model.notGraded > 0 && <> · {model.notGraded} not graded</>}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(model.scenariosPassed.score ?? 0) * 100}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Run <time dateTime={model.startedAt}>{model.startedAt.slice(0, 10)}</time> · {model.scenarioCount} scenarios
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="how-heading" className="border-t bg-card/50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative min-w-0 rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                      {step.icon}
                    </span>
                    <span className="text-xs text-muted-foreground">Step {index + 1}</span>
                  </div>
                  <h3 className="mt-2 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Fixline · Harbor Lane Property Management is fictional, and so is its data.</span>
          <nav aria-label="Footer" className="flex gap-4">
            <a href={GITHUB_URL} className="hover:text-foreground">
              GitHub
            </a>
            <a href={VIDEO_URL} className="hover:text-foreground">
              Demo video
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
