# 07: Proposal validation, editing, stale-Proposal check

**What to build:** Proposals that reference Work Orders, Units or Common Areas that don't exist are rejected before they reach the Board or the Review Queue. A Coordinator can edit a Proposal in the Review Queue before approving it. When a queued Proposal is approved, it is checked against the Board as it is now, and on conflict (for example, the target Work Order changed or closed) it goes back to review rather than overwriting. Rejected Proposals leave the Board untouched and are recorded.

**Blocked by:** 06

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/11

- [ ] Schema and referential validation reject invalid Proposals, and the reason appears in the trace
- [ ] An attach operation targeting a closed Work Order is rejected before it is applied, including on the auto-apply path (today only the agent prompt forbids it; found in Issue 04's review)
- [ ] A Coordinator can edit the Proposal's operations and labels before approving
- [ ] A deterministic test shows a stale Proposal returning to review instead of being applied
- [ ] Rejections are recorded and visible
- [ ] Validation failures count as failures in evals

## Comments

Usage: Implementer 88 input, 43,298 output, 116,722 cache creation, 4,010,951 cache read; Review Session 14 input, 4,685 output, 47,778 cache creation, 354,512 cache read.

**Review Session: Non-critical Findings**

- editProposal and a successful approveProposal never clear the entry's `conflicts`, so an edited entry that is still pending keeps showing the old 'Back in review: the Board changed' warning in the live page.
- ReviewQueueEntrySchema defaults `attachTargets` to [], so for entries stored in a browser sandbox before this change, findConflicts has no saved copy and misses a Work Order that changed but is still open. Closed or missing targets are still caught.
- editProposal keeps the original saved copy for attach targets the entry already had, so if the Work Order changed before the edit, the next approval goes back to review once more even though the Coordinator just saw the current Board.
- WorkOrderClosedError is exported but nothing catches it, and the API routes no longer map WorkOrderNotFoundError. Both are now only unhandled backstops inside applyProposal.
- Test helpers (usage, toolCallTurn, scriptedModel) are copied again in validation-and-editing.test.ts instead of being shared with the other Intake test files.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-07-2026-11-16T15-30-39-087Z.log`).

Usage: Body writer 2 input, 1,623 output, 42,770 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/11
