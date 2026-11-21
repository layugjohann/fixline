# 06: Responsive pass, cleanup and README screenshots

**What to build:** Finish the redesign.

- Console below `lg`: the rail becomes a drawer, and the queue, conversation and agent-run panes stack (or switch through tabs). Usable on a phone; not optimised for it.
- Remove the old views and inline styles that nothing uses any more (`app/replay-view.tsx`, `app/live/sandbox-view.tsx` and similar).
- Check light and dark on every page; check keyboard focus and contrast.
- Update the README: screenshots of the landing page, the Review Queue and the Scorecard (light mode), and replace "replay mode / live mode" wording with Demo and sandbox workspaces.
- The smoke test keeps its coverage, with role/label selectors throughout.

**Blocked by:** 02, 03, 04, 05

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/24

- [ ] Console usable below `lg` with a drawer rail and stacked panes
- [ ] Dead UI code removed
- [ ] Light and dark checked on every page
- [ ] README screenshots and wording updated

## Comments

Usage: Implementer 102 input, 36,226 output, 106,417 cache creation, 4,166,666 cache read; Review Session 24 input, 5,457 output, 49,671 cache creation, 589,241 cache read.

**Review Session: Critical Findings not fixed**

- The README embeds docs/screenshots/landing.png, review-queue.png and scorecard.png, but docs/screenshots/ was never committed, so the README shows three broken images and the Issue's 'README screenshots' item is not done. The reviewer could not generate them: the sandbox blocks Chromium from launching (bootstrap_check_in Permission denied). To fix: run `npm run build && npm start`, then `npm run screenshots`, and commit the three PNGs.

**Review Session: Non-critical Findings**

- 'Live mode' / 'replay mode' wording remains in code comments, test names, scripts/setup.sh and ADR 0002 (src/live/index.ts, src/live/own-key.ts, src/live/rate-limit.ts:127, src/live/live.test.ts, src/replays/replays.test.ts, src/intake/rejected-tool-calls.test.ts). The Issue only required the README wording to change.
- ConsoleRail renders IconRail and TopBar together, so `actions` (the New Message button) and ThemeToggle are mounted twice; CSS hides one copy at each breakpoint.
- On the Runs page, AgentRun's ArrowLeft/ArrowRight shortcuts still fire while the drawer is open; unlike the Review Queue's shortcuts, they don't check for an open [role=dialog].
- The empty-run branch in agent-run.tsx writes out its own copy of the rail classes instead of reusing AGENT_RUN_RAIL_CLASS, and its background (bg-card/50) differs from the rail's bg-muted/40.
- README has a doubled blank line before the 'Recorded run' table; two footers put `sm:px-6` before `text-muted-foreground`, out of the usual class order.

Usage: Implementer 30 input, 4,503 output, 29,068 cache creation, 385,939 cache read; Review Session 20 input, 2,884 output, 53,262 cache creation, 409,263 cache read.

**Review Session: Non-critical Findings**

- 'Live mode' / 'replay mode' wording remains in code comments, test names, scripts/setup.sh and ADR 0002 (src/live/index.ts, src/live/own-key.ts, src/live/rate-limit.ts:127, src/live/live.test.ts, src/replays/replays.test.ts, src/intake/rejected-tool-calls.test.ts). The Issue only required the README wording to change.
- ConsoleRail renders IconRail and TopBar together, so `actions` (the New Message button) and ThemeToggle are mounted twice, with CSS hiding one copy at each breakpoint.
- AgentRun's ArrowLeft/ArrowRight shortcuts still fire while the navigation drawer is open. Unlike the Review Queue's shortcuts, they don't check for an open [role=dialog].
- The empty-run branch in app/console/agent-run.tsx writes out its own copy of the rail classes instead of reusing AGENT_RUN_RAIL_CLASS, and its background (bg-card/50) differs from the rail's bg-muted/40.
- The README has a doubled blank line before the 'Recorded run' table, and two DecisionBar footers put `sm:px-6` before `text-muted-foreground`, out of the usual class order.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-06-2026-11-21T18-58-55-815Z.log`).

Usage: Body writer 2 input, 1,154 output, 37,928 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/24
