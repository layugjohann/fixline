# 03: Eval harness + first golden scenarios

**What to build:** A developer can run the eval suite from the command line. The runner:
- loads golden scenarios (starting Board state, Property Roster, Message, expected Proposal);
- runs Intake against a fresh fake Board for each scenario;
- grades each dimension;
- saves each run's trace;
- prints a scorecard.

It ships with about 10 scenarios covering simple creates, non-maintenance Messages, and each Urgency level. Scenarios are written before tuning the agent to pass them.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] The golden scenario format holds a starting Board, Property Roster, Message, and expected Proposal
- [x] There are rule-based graders for classification (maintenance or not), Urgency, Trade, and Unit
- [x] Each run prints a scorecard per dimension and per scenario, and writes it in a machine-readable form
- [x] Each scenario's trace is saved and uses the same trace format Intake returns
- [x] About 10 scenarios cover non-maintenance Messages, emergency, urgent, and routine
- [x] A failing scenario shows clearly which dimension failed and why

## Comments

- 2026-11-15: Added `src/evals/`: the scenario format (`scenario.ts`), 11 golden scenarios (`golden-scenarios.ts`: 4 non-maintenance, 2 routine, 2 urgent, 3 emergency), rule-based graders for classification, Unit, Trade and Urgency (`graders.ts`), the runner (`runner.ts`), the scorecard in text and JSON (`scorecard.ts`), and the CLI `npm run eval` (`cli.ts`, run with `tsx`). Deterministic tests use the mock model. No live-model eval was run here because this worktree has no `GROQ_API_KEY`, so the first real scorecard is still to come.
