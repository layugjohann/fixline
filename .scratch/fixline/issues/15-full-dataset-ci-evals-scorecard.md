# 15: Full golden dataset, CI eval smoke, model scorecard

**What to build:** The golden dataset grows to 60–100 scenarios covering every hard case in the spec, including injection combined with matching and splitting. A small smoke subset of evals runs in CI on every push within free-tier limits. A cross-model comparison (Groq, Gemini, and a frontier model through the author's own key) produces the scorecard for the README.

**Blocked by:** 05, 07, 08, 09, 10

**Status:** ready-for-human

- [ ] The golden dataset has 60–100 scenarios spanning every grader dimension
- [ ] CI runs an eval smoke subset on every push using the repository secret, and fails on regression
- [ ] The cross-model run produces a scorecard table that can be embedded in the README
- [ ] Known weak spots found by the comparison are written up briefly

## Comments

Usage: Implementer 64 input, 61,018 output, 141,451 cache creation, 3,296,126 cache read; Review Session 4 input, 2,555 output, 48,474 cache creation, 69,069 cache read.

**Review Session: Critical Findings not fixed**

- Two Issue 15 acceptance items are not done. No cross-model run was made: the README scorecard block still says 'Not recorded yet', and the 'Known weak spots' paragraph is a placeholder. The tooling (`npm run eval:compare -- ... --readme README.md`) is in place, but filling them needs real Groq, Gemini and Claude runs on keys only the human holds, so this review could not fix it. Run the three evals, embed the table, and write up the weak spots before the Issue counts as done.

**Review Session: Non-critical Findings**

- The smoke tag is defined twice: `SMOKE_TAG` in src/evals/golden-scenarios.ts and the literal `--tag smoke` in package.json's `eval:smoke` script. Renaming one silently breaks the CI subset.
- The eval-smoke CI job runs on every push to every branch. Several branches pushed in a day each spend a few dozen of Groq's free-tier requests (the concurrency group only queues runs, it doesn't skip them). Consider limiting it to main and pull-request heads if the free-tier quota gets tight.
