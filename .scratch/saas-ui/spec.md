# Spec: a SaaS console for Fixline

## Problem Statement

Fixline's foundations (Intake, review rules, evals, traces, live sandbox) are done, but the UI is a single 720px column of headings with inline styles. It undersells the project as a portfolio piece: a recruiter can't tell at a glance that this is a product, and the Scorecard (the strongest differentiator) only exists in the README.

## Solution

A short landing page at `/` and a desktop-first SaaS console where the visitor sits in the Coordinator's seat. The look is **Variant C, three-pane triage**, chosen from three prototypes (record: branch `prototype/saas-ui-console`, commit `bbdbab6`, route `/prototype/console?variant=C`).

## Decisions (from the grilling session, 2026-11-21)

- **Shape:** landing page + console. The console has a workspace switcher: **Demo (recorded)**, read-only and the default, built from `replays/`; and **Your sandbox (live)**, today's live mode with Reset and the own-key box. `/` and `/live` keep working.
- **Navigation (icon rail, glossary terms):** Work: Incoming Messages, Review Queue (pending badge), Board. Reference: Property Roster. Agent: Runs, Scorecard. "New Message" (send as a Tenant) is an action, not a page.
- **Review Queue layout (Variant C):** icon rail, then queue pane ("To review" / "Auto-handled"), then conversation pane (Message as an inbound bubble, a "Held for review: <rules>" divider, the Proposal as a diff against the Board, Draft Replies as dashed outgoing bubbles, a sticky decision bar with A / E / R shortcuts), then an agent-run rail that steps through the trace with the selected tool call's input/output.
- **Board:** Kanban columns by Urgency (Emergency / Urgent / Routine), with Closed collapsed. Toggle to a filterable table (Urgency, Trade, Location).
- **Scorecard page:** built at build time from `eval-runs/*/scorecard.json`. The latest run per model side by side, then a per-scenario pass/fail grid; clicking a scenario opens its eval trace in the same trace viewer.
- **Landing page:** a hero with an animated "messy Message → Work Orders" example and two buttons (open Demo / open your sandbox); three feature cards (human review, evals, replayable traces); a Scorecard teaser; a 4-step "how it works" strip (Message → lookups → Proposal → review rules → Board); a footer with GitHub and the video. No pricing, no testimonials.
- **Branding:** Fixline wordmark (lucide wrench on teal). Harbor Lane is the workspace, not the product.
- **Stack:** Tailwind v4 + shadcn/ui + lucide-react. Light by default, with dark from the system preference plus a toggle, through design tokens.
- **Responsive:** the landing page is fully responsive. The console is desktop-first: below `lg` the rail becomes a drawer and the panes stack.
- **Domain language:** "Inbox" becomes **Incoming Messages** (GLOSSARY.md). In code, `inbox` / `InboxItem` / `inboxMessages` become `incomingMessages` / `IncomingMessage…`, and `SANDBOX_VERSION` goes to 2 (old browser sandboxes are reseeded).
- **Tests:** `e2e/smoke.spec.ts` keeps its coverage (replay steps through; a sandbox Message flows to the Review Queue and on to the Board). Selectors move to roles and labels.
- **No ADRs:** none of these choices is both hard to reverse and surprising.

## Out of Scope

- New domain behaviour (Intake, review rules and the applier are unchanged).
- Real accounts, auth, multiple workspaces beyond Demo and the visitor's sandbox.
- Mobile-first console work.
