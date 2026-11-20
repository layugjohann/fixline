# 01: Design system and console shell, with the Demo workspace's Review Queue

**What to build:** The first vertical slice of the console, in the look of prototype Variant C (see `../spec.md`, and `app/prototype/console/variant-c.tsx` on branch `prototype/saas-ui-console`, commit `bbdbab6`, for reference only: rewrite it properly, don't copy it).

- Add Tailwind v4, shadcn/ui and lucide-react. Define colour tokens (teal accent, stone neutrals) with light and dark values; light by default, dark from the system preference plus a toggle in the rail.
- Console layout: an icon rail with the nav from the spec (glossary labels, tooltips, a pending-count badge on Review Queue), a workspace switcher (Demo / Your sandbox), and the Fixline wordmark. Pages that don't exist yet show as disabled in the rail.
- The **Demo** workspace's Review Queue, built from `replays/` at build time: queue pane ("To review" / "Auto-handled"), conversation pane (Message bubble, "Held for review" divider, Proposal as a diff against the Board, Draft Reply bubbles, decision bar shown disabled with "Read-only demo: open your sandbox to decide"), and the agent-run rail stepping through the trace.
- **Runs** page (Demo): every replay's run in a list; opening one shows the same agent-run view full width. This replaces `app/trace-viewer.tsx`'s look; the trace format is unchanged.
- `/` stays as it is until Issue 05; add a link from it to the console.
- Keep `e2e/smoke.spec.ts` passing; move its replay-mode selectors to roles/labels on the new Runs or Review Queue view.

**Decision record:** Variant C chosen over A (dense dark list + side panel) and B (light dashboard + detail page) on 2026-11-21. Prototype: branch `prototype/saas-ui-console`, `/prototype/console?variant=C`.

**Blocked by:** none

**Status:** in-progress

- [ ] Tailwind v4 + shadcn/ui + lucide-react set up, with light/dark tokens and a toggle
- [ ] Console layout with the icon rail, glossary nav labels, workspace switcher and wordmark
- [ ] Demo Review Queue renders every replay in the three-pane layout, read-only
- [ ] Runs page lists replays and steps through each trace, including rejection, rejected-tool-call and retry steps
- [ ] Smoke test passes with role/label selectors

## Comments

Usage: Implementer 80 input, 48,875 output, 108,311 cache creation, 3,329,608 cache read; Review Session 16 input, 5,844 output, 121,249 cache creation, 908,101 cache read.

**Review Session: Non-critical Findings**

- The Spec says that below `lg` the console rail becomes a drawer and the panes stack; the console is a fixed three-pane row at all widths. Not on Issue 01's checklist, so likely later work.
- Unused code: components/ui/badge.tsx and components/ui/separator.tsx are never imported, and DemoEntry.recordedAt is never read.
- Duplicated labels: app/live/sandbox-view.tsx keeps its own RULE_LABELS and DRAFT_REPLY_PURPOSE_LABELS, with different wording, next to the new ones in src/console.
- Review Queue: switching tabs keeps the previous entry selected, so the conversation and agent-run panes can show an entry that isn't in the visible list.
- The queue pane's tabs use role="tab" without arrow-key navigation, which tablists normally support.
- The workspace switcher's "Your sandbox" item links to /live, a full page load to the old layout, rather than a sandbox workspace inside the console. Acceptable for this slice, but not yet the workspace the Spec describes.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-01-2026-11-20T20-07-04-539Z.log`).

Usage: Body writer 2 input, 1,254 output, 110,896 cache creation, 11,842 cache read.
