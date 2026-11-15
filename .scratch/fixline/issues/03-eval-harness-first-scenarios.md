# 03: Eval harness + first golden scenarios

**What to build:** A developer can run the eval suite from the command line. The runner:
- loads golden scenarios (starting Board state, Property Roster, Message, expected Proposal);
- runs Intake against a fresh fake Board for each scenario;
- grades each dimension;
- saves each run's trace;
- prints a scorecard.

It ships with about 10 scenarios covering simple creates, non-maintenance Messages, and each Urgency level. Scenarios are written before tuning the agent to pass them.

**Blocked by:** 01

**Status:** done
Pull Request: https://github.com/layugjohann/fixline/pull/3

- [x] The golden scenario format holds a starting Board, Property Roster, Message, and expected Proposal
- [x] There are rule-based graders for classification (maintenance or not), Urgency, Trade, and Unit
- [x] Each run prints a scorecard per dimension and per scenario, and writes it in a machine-readable form
- [x] Each scenario's trace is saved and uses the same trace format Intake returns
- [x] About 10 scenarios cover non-maintenance Messages, emergency, urgent, and routine
- [x] A failing scenario shows clearly which dimension failed and why

## Comments

- 2026-11-15: Added `src/evals/`: the scenario format (`scenario.ts`), 11 golden scenarios (`golden-scenarios.ts`: 4 non-maintenance, 2 routine, 2 urgent, 3 emergency), rule-based graders for classification, Unit, Trade and Urgency (`graders.ts`), the runner (`runner.ts`), the scorecard in text and JSON (`scorecard.ts`), and the CLI `npm run eval` (`cli.ts`, run with `tsx`). Deterministic tests use the mock model. No live-model eval was run here because this worktree has no `GROQ_API_KEY`, so the first real scorecard is still to come.

Usage: Implementer 40 input, 23,822 output, 57,297 cache creation, 1,038,597 cache read; Review Session 10 input, 2,665 output, 51,537 cache creation, 248,644 cache read.

**Review Session: Non-critical Findings**

- graders.ts gradeWorkOrderField pairs proposed and expected Work Orders by position. This works for the current single-Work-Order scenarios, but a correct multi-problem Proposal listed in a different order will fail. Matching by Unit, or order-independent matching, will be needed once multi-problem scenarios are added.
- A wrong number of Work Orders (for example, a non-maintenance Message that gets a Work Order) fails unit, trade and urgency all for the same reason. That one mistake counts three times in the per-dimension scores, on top of the classification failure. A separate 'number of Work Orders' dimension (Spec story 44) would keep these scores apart.
- graders.ts: the Grade type is a union of three branches that are the same except for the status literal. A single object with status: "pass" | "fail" | "skip" would be simpler.
- runner.ts: when a run breaks for a non-agent reason (such as a rate limit), an empty trace ({ messageId, steps: [] }) is still written to traces/<id>.json. That file looks like a real but empty run. Either skip writing it or mark the scenario as errored in the trace.
- In evals.test.ts, the scripted mock model works out which Message it was given by searching the serialised prompt for an escaped JSON id. The test breaks if the way the Message is wrapped in the prompt changes, which conflicts with the rule that tests don't depend on prompts.
- The scorecard is only written as JSON and plain terminal text. The Spec's eval harness section also calls for a form the README can embed (for example, a markdown table). The Issue only requires machine-readable output, so this can be added when the README scorecard is built.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-03-2026-11-15T15-47-48-052Z.log`).

Usage: Body writer 2 input, 1,112 output, 41,142 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/3
