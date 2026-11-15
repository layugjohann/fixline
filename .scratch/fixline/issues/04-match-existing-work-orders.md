# 04: Match Messages to existing Work Orders

**What to build:** When a Message concerns a problem already on the Board, Intake attaches the Message to that open Work Order (adding the new information and linking the Message) instead of creating a duplicate. Angry follow-ups ("still broken!!") are recognised as updates.

**Blocked by:** 03

**Status:** awaiting-merge
Pull Request: https://github.com/layugjohann/fixline/pull/4

- [ ] The agent has read-only tools to search open Work Orders and get a single Work Order
- [ ] The Proposal supports an attach-to-existing-Work-Order operation alongside create
- [ ] The fake Board supports appending information to a Work Order and linking source Messages
- [ ] A deterministic test covers an attach Proposal updating the correct Work Order
- [ ] A match-target grader is added to the eval harness
- [ ] Scenarios cover duplicates, follow-ups, and a similar-but-different problem that must NOT be matched

## Comments

Usage: Implementer 40 input, 19,813 output, 63,596 cache creation, 1,082,918 cache read; Review Session 14 input, 4,079 output, 42,983 cache creation, 304,186 cache read.

**Review Session: Non-critical Findings**

- An attach operation targeting a closed Work Order is applied automatically: getWorkOrder exposes closed Work Orders to the agent, and neither applyProposal nor FakeBoard.appendToWorkOrder checks status === 'open'. Only the prompt forbids it. Expected to be covered by Issue 07's validation and stale-Proposal check.
- Nothing checks attach workOrderIds before applying. An attach to a missing Work Order throws WorkOrderNotFoundError partway through applyProposal, after any earlier create operations have already been written (leaving the Board half-modified), and app/api/intake/route.ts doesn't handle it, so the route returns a 500. Deferred to Issue 07.
- decideRouting auto-applies attaches to Work Orders raised by a different Tenant (ADR 0003 sends these to review), and the new 'Updates existing Work Order(s)' branch gives the same outcome as the default branch. Scheduled for Issue 06.
- The Board interface gained appendToWorkOrder, but there is no shared Board contract test suite covering it yet (the standards say a change to the Board interface updates that suite). The suite arrives in Issue 14.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-04-2026-11-15T16-06-09-476Z.log`).

Usage: Body writer 2 input, 1,474 output, 31,163 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/4
