# 05: Landing page

**What to build:** Replace `/` (today's replay mode) with the landing page from the spec. Replay mode itself now lives in the console's Demo workspace (Issue 01).

- Hero: the one-line pitch, an animated example of a messy Message turning into structured Work Orders (use a real replay, e.g. "Heater dead again, plus a dripping tap"), and two buttons: open the Demo, open your sandbox.
- Three feature cards: human review (rules, not confidence), evals, replayable traces.
- A Scorecard teaser (the headline numbers from Issue 04's data) linking to the Scorecard page.
- A "how it works" strip: Message → lookups → Proposal → review rules → Board.
- Footer: GitHub and the demo video link.
- Fully responsive (phone width with a 16px gutter, no horizontal scroll). No pricing, no testimonials.
- Update `e2e/smoke.spec.ts` so its replay check starts from the landing page's Demo button.

**Blocked by:** 01, 04

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/23

- [ ] `/` is the landing page and its buttons open the Demo and sandbox workspaces
- [ ] Animated example uses a real replay
- [ ] Scorecard teaser reads the same data as the Scorecard page
- [ ] Responsive at phone width; smoke test passes

## Comments

Usage: Implementer 44 input, 19,813 output, 75,906 cache creation, 1,303,667 cache read; Review Session 16 input, 3,556 output, 32,454 cache creation, 291,653 cache read.

**Review Session: Non-critical Findings**

- app/trace-viewer.tsx is now dead code: its only importer, app/replay-view.tsx, was deleted and nothing else imports TraceViewer. Remove it (Preset rule: no dead code).
- The Scorecard teaser in app/page.tsx works out the headline percentage inline with Math.round(score * 100), repeating the rounding in formatRatio (src/console/scorecard.ts). A shared percentage helper would avoid the duplicated logic.
- src/console/landing.test.ts tests the helpers landingExample/pickLandingReplay against the committed replay files rather than going through the agreed seams (the Intake entry point and the Board interface). Arguably at odds with the Testing standard.
- The footer's 'Demo video' link points to the GitHub README (#readme) because the video isn't published yet. Update VIDEO_URL once it is.

Usage: Implementer 12 input, 1,848 output, 14,556 cache creation, 132,806 cache read; Review Session 8 input, 2,280 output, 31,015 cache creation, 134,657 cache read.

**Review Session: Non-critical Findings**

- app/page.tsx: the Scorecard teaser's meter sets its width inline as `${(score ?? 0) * 100}%` instead of using the new formatPercent helper, which the Scorecard page's Meter now uses. The percentage logic is still repeated (Preset rule: no duplicated logic).
- src/console/landing.test.ts tests the helpers landingExample and pickLandingReplay directly against the committed replay files, not through the agreed seams (the Intake entry point and the Board interface). This is arguably at odds with the Testing standard.
- The footer's 'Demo video' link (VIDEO_URL) points to the GitHub README (#readme) as a placeholder until the video is published.
- e2e/smoke.spec.ts only checks that the landing h1 contains 'Work Orders'. That is a loose check; an accessible-name check on the whole heading would be more precise.

Usage: Implementer 10 input, 1,334 output, 13,854 cache creation, 108,353 cache read; Review Session 18 input, 2,196 output, 32,493 cache creation, 350,349 cache read.

**Review Session: Non-critical Findings**

- src/console/landing.test.ts tests the helpers landingExample and pickLandingReplay directly against the committed replay files, not through the agreed seams (the Intake entry point and the Board interface). This is arguably at odds with the Testing standard ('Tests don't assert on ... internal helper functions').
- The footer's 'Demo video' link (VIDEO_URL in app/page.tsx) points to the GitHub README (#readme) as a placeholder until the video is published. Update it once the video is out.
- The Scorecard teaser in app/page.tsx shows only the first 10 characters of startedAt with an inline .slice(0, 10), while the console has a shared formatDateTime helper in src/console. Using a shared date formatter would match how the rest of the app shows dates.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-05-2026-11-21T17-54-26-994Z.log`).

Usage: Body writer 2 input, 1,352 output, 27,827 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/23
