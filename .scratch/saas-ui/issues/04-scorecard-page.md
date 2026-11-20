# 04: Scorecard page

**What to build:** The console's **Scorecard** page, built at build time from `eval-runs/*/scorecard.json` (and the traces next to each), so it makes no model calls.

- The latest run per model side by side, on the same dimensions as the README table (meter or bar rows, with the n/N counts visible). Show the run date, judge model and scenario count.
- Below that, a per-scenario grid: rows are scenarios, columns are models, cells are pass/fail per dimension or overall.
- Clicking a scenario cell opens that eval run's trace in the agent-run view from Issue 01 (same trace format).
- If a model's run is missing or partial, show it as not graded rather than failing.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Model comparison built from the committed scorecard files at build time
- [x] Per-scenario grid
- [x] Clicking a scenario opens its eval trace
- [x] A test covers turning a scorecard file into the page's data
