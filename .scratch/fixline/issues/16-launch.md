# 16: Launch

**What to build:** The project is ready to put in front of recruiters:
- a browser smoke test against the deployed app (replay loads; a sandbox Message flows to the Review Queue using the mock model or a recorded trace);
- a curated set of replay traces showing the hard cases;
- the final README, leading with the demo link, the scorecard and the video;
- a 2-minute demo video, which includes the real Trello integration.

**Human step:** the author records the video.

**Blocked by:** 11, 13, 14, 15, 17, 18
**Stacked on:** issue/18-recover-from-rejected-tool-calls

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/18

- [ ] The browser smoke test passes against the deployed URL without making free-tier calls
- [ ] Curated replays cover a duplicate, a multi-problem split, the ceiling leak, an emergency, and an injection attempt
- [ ] The README leads with the live link, the scorecard and the video, and frames the project as the Harbor Lane engagement and sequel to the Trello sync
- [ ] The demo video is linked from the README

## Comments

Usage: Implementer 56 input, 20,057 output, 84,590 cache creation, 1,939,495 cache read; Review Session 16 input, 3,825 output, 45,114 cache creation, 373,518 cache read.

**Review Session: Non-critical Findings**

- e2e/smoke.spec.ts finds the Review Queue and Board lists with CSS sibling selectors (`h2:text-is('Review Queue') + ul`, `h2:text-is('Board') + ul`), which tie the test to page markup. Accessible regions or labels would be sturdier.
- README Roadmap item 5 mixes finished and pending work in one unchecked line ('... (done); demo video (being recorded)'). Separate items would read more clearly.
- The browser smoke test was not run in this review: no Playwright browsers are installed here and the test targets the deployed URL. Its selectors were checked by hand against the UI source and all match.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-16-2026-11-20T16-06-02-433Z.log`).

Usage: Body writer 2 input, 1,179 output, 33,124 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/18

Stacked on Base Issue 18: this Pull Request targets `issue/18-recover-from-rejected-tool-calls`, the branch of https://github.com/layugjohann/fixline/pull/17. Merge that Pull Request first.
