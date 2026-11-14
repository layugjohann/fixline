# 04: Match Messages to existing Work Orders

**What to build:** When a Message concerns a problem already on the Board, Intake attaches the Message to that open Work Order (adding the new information and linking the Message) instead of creating a duplicate. Angry follow-ups ("still broken!!") are recognised as updates.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The agent has read-only tools to search open Work Orders and get a single Work Order
- [ ] The Proposal supports an attach-to-existing-Work-Order operation alongside create
- [ ] The fake Board supports appending information to a Work Order and linking source Messages
- [ ] A deterministic test covers an attach Proposal updating the correct Work Order
- [ ] A match-target grader is added to the eval harness
- [ ] Scenarios cover duplicates, follow-ups, and a similar-but-different problem that must NOT be matched
