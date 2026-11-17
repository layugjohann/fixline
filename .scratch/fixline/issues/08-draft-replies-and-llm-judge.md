# 08: Draft Replies + LLM judge

**What to build:** The agent drafts a reply to the Tenant when it needs information (a missing Unit) or when the Sender's stated Unit doesn't match the Property Roster. Every Draft Reply requires Coordinator approval. Approving one marks it as sent in the sandbox; nothing is actually sent. Draft Reply quality is graded in evals by an LLM judge against a written rubric.

**Blocked by:** 06

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/12

- [ ] The Proposal can include Draft Replies
- [ ] Any Proposal with a Draft Reply is always routed to review (deterministic test)
- [ ] The Review Queue shows Draft Replies, and approving marks them as sent
- [ ] A written rubric exists, and an LLM-judge grader scores Draft Replies against it
- [ ] Scenarios cover a missing Unit, a Unit mismatch, and a confirmation-worthy emergency

## Comments

Usage: Implementer 88 input, 41,923 output, 138,836 cache creation, 4,588,446 cache read; Review Session 12 input, 3,976 output, 60,435 cache creation, 347,586 cache read.

**Review Session: Non-critical Findings**

- The LLM judge defaults to the model under test (no --judge or FIXLINE_JUDGE_MODEL), so a model grades its own Draft Replies, which can inflate reply-quality scores. Consider a fixed judge independent of the evaluated model for the published scorecard.
- src/evals/judge.ts: when the judge gives no valid verdict, the reply-quality dimension is quietly skipped. The scorecard shows this the same way as a skip because nothing applied, so judge failures are easy to miss.
- app/live/page.tsx RULE_LABELS and src/intake/review-policy.ts RULE_REASONS are parallel wordings of the same rules, and every new rule (such as draft-reply) must be added to both.
- app/trace-viewer.tsx always labels a Draft Reply 'waiting for a Coordinator's approval'. That is true when the trace was recorded, but readers may take it as the reply's current status.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-08-2026-11-16T15-40-09-405Z.log`).

Usage: Body writer 2 input, 1,569 output, 48,985 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/12
