# 07: Proposal validation, editing, stale-Proposal check

**What to build:** Proposals that reference Work Orders, Units or Common Areas that don't exist are rejected before they reach the Board or the Review Queue. A Coordinator can edit a Proposal in the Review Queue before approving it. When a queued Proposal is approved, it is checked against the Board as it is now, and on conflict (for example, the target Work Order changed or closed) it goes back to review rather than overwriting. Rejected Proposals leave the Board untouched and are recorded.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Schema and referential validation reject invalid Proposals, and the reason appears in the trace
- [ ] An attach operation targeting a closed Work Order is rejected before it is applied, including on the auto-apply path (today only the agent prompt forbids it; found in Issue 04's review)
- [ ] A Coordinator can edit the Proposal's operations and labels before approving
- [ ] A deterministic test shows a stale Proposal returning to review instead of being applied
- [ ] Rejections are recorded and visible
- [ ] Validation failures count as failures in evals
