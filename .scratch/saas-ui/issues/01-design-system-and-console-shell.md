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

**Status:** ready-for-agent

- [ ] Tailwind v4 + shadcn/ui + lucide-react set up, with light/dark tokens and a toggle
- [ ] Console layout with the icon rail, glossary nav labels, workspace switcher and wordmark
- [ ] Demo Review Queue renders every replay in the three-pane layout, read-only
- [ ] Runs page lists replays and steps through each trace, including rejection, rejected-tool-call and retry steps
- [ ] Smoke test passes with role/label selectors
