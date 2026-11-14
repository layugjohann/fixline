# 08: Draft Replies + LLM judge

**What to build:** The agent drafts a reply to the Tenant when it needs information (a missing Unit) or when the Sender's stated Unit doesn't match the Property Roster. Every Draft Reply requires Coordinator approval. Approving one marks it as sent in the sandbox; nothing is actually sent. Draft Reply quality is graded in evals by an LLM judge against a written rubric.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The Proposal can include Draft Replies
- [ ] Any Proposal with a Draft Reply is always routed to review (deterministic test)
- [ ] The Review Queue shows Draft Replies, and approving marks them as sent
- [ ] A written rubric exists, and an LLM-judge grader scores Draft Replies against it
- [ ] Scenarios cover a missing Unit, a Unit mismatch, and a confirmation-worthy emergency
