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

- [ ] The golden scenario format holds a starting Board, Property Roster, Message, and expected Proposal
- [ ] There are rule-based graders for classification (maintenance or not), Urgency, Trade, and Unit
- [ ] Each run prints a scorecard per dimension and per scenario, and writes it in a machine-readable form
- [ ] Each scenario's trace is saved and uses the same trace format Intake returns
- [ ] About 10 scenarios cover non-maintenance Messages, emergency, urgent, and routine
- [ ] A failing scenario shows clearly which dimension failed and why
