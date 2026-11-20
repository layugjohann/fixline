# 06: Responsive pass, cleanup and README screenshots

**What to build:** Finish the redesign.

- Console below `lg`: the rail becomes a drawer, and the queue, conversation and agent-run panes stack (or switch through tabs). Usable on a phone; not optimised for it.
- Remove the old views and inline styles that nothing uses any more (`app/replay-view.tsx`, `app/live/sandbox-view.tsx` and similar).
- Check light and dark on every page; check keyboard focus and contrast.
- Update the README: screenshots of the landing page, the Review Queue and the Scorecard (light mode), and replace "replay mode / live mode" wording with Demo and sandbox workspaces.
- The smoke test keeps its coverage, with role/label selectors throughout.

**Blocked by:** 02, 03, 04, 05

**Status:** ready-for-agent

- [ ] Console usable below `lg` with a drawer rail and stacked panes
- [ ] Dead UI code removed
- [ ] Light and dark checked on every page
- [ ] README screenshots and wording updated
