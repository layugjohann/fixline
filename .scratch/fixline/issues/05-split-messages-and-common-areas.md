# 05: Split multi-problem Messages + Common Areas

**What to build:** A single Message describing several problems yields one Proposal with several operations. For example, "the heater is dead again, also the kitchen tap drips" attaches to the existing heater Work Order and creates a new one for the tap. Problems in a Common Area (lobby, laundry room) are recorded against that Common Area, not the Sender's Unit, so reports from different Units can merge.

**Blocked by:** 04

**Status:** awaiting-merge
Pull Request: https://github.com/layugjohann/fixline/pull/5

- [ ] The Property Roster fixture includes Common Areas per Property
- [ ] Work Orders can belong to a Unit or a Common Area
- [ ] There are graders for the number of Work Orders and for location (Unit or Common Area)
- [ ] Scenarios cover a two-problem Message (attach + create), a three-problem Message, and Common Area reports from two different Units merging into one Work Order
- [ ] A deterministic test covers a multi-operation Proposal being applied completely

## Comments

Usage: Implementer 46 input, 27,041 output, 93,817 cache creation, 1,747,151 cache read; Review Session 10 input, 2,835 output, 47,498 cache creation, 224,609 cache read.

**Review Session: Non-critical Findings**

- Glossary 'Avoid' synonym 'shared space' (for Common Area) is used in the create operation's location .describe() in src/domain/index.ts, in the agent instructions in src/intake/agent.ts, and in a comment in src/evals/scenario.ts.
- The agent only learns a Property's Common Areas through lookUpSender. An unknown Sender gets no Common Area ids, so the agent cannot correctly record their Common Area report. Worth addressing alongside unknown-Sender handling.
- searchOpenWorkOrders accepts both unitId and commonAreaId; passing both always returns an empty list. Making them mutually exclusive in the tool schema would be cleaner.
- In src/evals/evals.test.ts, the order-independent grading test has a very long line that repeats a perfectProposal(twoProblems) call; extracting a variable would read better.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-05-2026-11-15T16-22-13-192Z.log`).

Usage: Body writer 2 input, 1,292 output, 37,465 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/5
