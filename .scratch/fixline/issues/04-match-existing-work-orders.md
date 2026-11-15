# 04: Match Messages to existing Work Orders

**What to build:** When a Message concerns a problem already on the Board, Intake attaches the Message to that open Work Order (adding the new information and linking the Message) instead of creating a duplicate. Angry follow-ups ("still broken!!") are recognised as updates.

**Blocked by:** 03

**Status:** done
Pull Request: https://github.com/layugjohann/fixline/pull/4

- [x] The agent has read-only tools to search open Work Orders and get a single Work Order
- [x] The Proposal supports an attach-to-existing-Work-Order operation alongside create
- [x] The fake Board supports appending information to a Work Order and linking source Messages
- [x] A deterministic test covers an attach Proposal updating the correct Work Order
- [x] A match-target grader is added to the eval harness
- [x] Scenarios cover duplicates, follow-ups, and a similar-but-different problem that must NOT be matched

## Comments

- 2026-11-16: Follow-ups from the review's non-critical findings. `app/api/intake/route.ts` now returns 502 instead of an unhandled 500 when an attach targets a Work Order that isn't on the Board (the request's Board is discarded on error, so the browser's Board stays unchanged). Issue 07 gained an explicit criterion for rejecting attaches to closed Work Orders. The cross-Tenant routing finding stays with Issue 06 and the Board contract suite with Issue 14. Note: if Issue 14 (Trello) lands before Issue 07, an attach to a missing Work Order can leave a real Board half-written.

Usage: Implementer 40 input, 19,813 output, 63,596 cache creation, 1,082,918 cache read; Review Session 14 input, 4,079 output, 42,983 cache creation, 304,186 cache read.

**Review Session: Non-critical Findings**

- An attach operation targeting a closed Work Order is applied automatically: getWorkOrder exposes closed Work Orders to the agent, and neither applyProposal nor FakeBoard.appendToWorkOrder checks status === 'open'. Only the prompt forbids it. Expected to be covered by Issue 07's validation and stale-Proposal check.
- Nothing checks attach workOrderIds before applying. An attach to a missing Work Order throws WorkOrderNotFoundError partway through applyProposal, after any earlier create operations have already been written (leaving the Board half-modified), and app/api/intake/route.ts doesn't handle it, so the route returns a 500. Deferred to Issue 07.
- decideRouting auto-applies attaches to Work Orders raised by a different Tenant (ADR 0003 sends these to review), and the new 'Updates existing Work Order(s)' branch gives the same outcome as the default branch. Scheduled for Issue 06.
- The Board interface gained appendToWorkOrder, but there is no shared Board contract test suite covering it yet (the standards say a change to the Board interface updates that suite). The suite arrives in Issue 14.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-04-2026-11-15T16-06-09-476Z.log`).

Usage: Body writer 2 input, 1,474 output, 31,163 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/4
