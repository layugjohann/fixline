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

**Status:** ready-for-agent

- [ ] `/` is the landing page and its buttons open the Demo and sandbox workspaces
- [ ] Animated example uses a real replay
- [ ] Scorecard teaser reads the same data as the Scorecard page
- [ ] Responsive at phone width; smoke test passes
