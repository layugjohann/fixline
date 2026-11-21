# 04: Scorecard page

**What to build:** The console's **Scorecard** page, built at build time from `eval-runs/*/scorecard.json` (and the traces next to each), so it makes no model calls.

- The latest run per model side by side, on the same dimensions as the README table (meter or bar rows, with the n/N counts visible). Show the run date, judge model and scenario count.
- Below that, a per-scenario grid: rows are scenarios, columns are models, cells are pass/fail per dimension or overall.
- Clicking a scenario cell opens that eval run's trace in the agent-run view from Issue 01 (same trace format).
- If a model's run is missing or partial, show it as not graded rather than failing.

**Blocked by:** 01

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/22

- [x] Model comparison built from the committed scorecard files at build time
- [x] Per-scenario grid
- [x] Clicking a scenario opens its eval trace
- [x] A test covers turning a scorecard file into the page's data

## Comments

Usage: Implementer 58 input, 26,927 output, 77,138 cache creation, 1,749,606 cache read; Review Session 16 input, 4,906 output, 37,301 cache creation, 331,791 cache read.

**Review Session: Non-critical Findings**

- No eval-runs/ directory is committed (the .gitignore change only allows committing one), so the deployed Scorecard page will show its 'No eval runs yet' state until someone commits the runs behind the README table. The Issue's first checkbox is ticked, but no committed scorecard files exist yet.
- src/evals/eval-runs.ts imports ScorecardFileSchema and EvalRunFiles from @/console/scorecard, so the evals module depends on the console module. The saved scorecard.json schema belongs in src/evals/scorecard.ts next to ScorecardSummarySchema.
- modelColumn in src/console/scorecard.ts duplicates the comparison math in formatComparisonMarkdown (scenarios passed out of passed+failed, per-dimension ratios, not-graded = notRun+errored) and adds a second ratio helper, instead of sharing one helper.
- scorecard-view.tsx renders several judge models as adjacent <code> elements with no separator, so their names run together when models used different judges.
- loadEvalTrace calls TraceSchema.parse without wrapping the error, so a malformed trace file fails the build without naming the file (unlike loadEvalRuns, which names the scorecard file).

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-04-2026-11-20T21-23-30-886Z.log`).

Usage: Body writer 2 input, 1,174 output, 28,476 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/22
