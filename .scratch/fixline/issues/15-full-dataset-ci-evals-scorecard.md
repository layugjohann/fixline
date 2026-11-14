# 15: Full golden dataset, CI eval smoke, model scorecard

**What to build:** The golden dataset grows to 60–100 scenarios covering every hard case in the spec, including injection combined with matching and splitting. A small smoke subset of evals runs in CI on every push within free-tier limits. A cross-model comparison (Groq, Gemini, and a frontier model through the author's own key) produces the scorecard for the README.

**Blocked by:** 05, 07, 08, 09, 10

**Status:** ready-for-agent

- [ ] The golden dataset has 60–100 scenarios spanning every grader dimension
- [ ] CI runs an eval smoke subset on every push using the repository secret, and fails on regression
- [ ] The cross-model run produces a scorecard table that can be embedded in the README
- [ ] Known weak spots found by the comparison are written up briefly
