# 12: Demo sandbox

**What to build:** Each visitor gets their own sandbox: a Board, Review Queue, and Property Roster seeded from fixtures, plus an inbox of example Messages. Visitors can send their own Message "as a Tenant", process inbox Messages live, work the Review Queue, and reset to the seeded state. All sandbox state lives in the visitor's browser, so visitors can't affect each other.

**Blocked by:** 02, 06

**Status:** ready-for-agent

- [ ] A first visit seeds the sandbox from fixtures
- [ ] The inbox lists example Messages, and processing one runs Intake live
- [ ] A "send as Tenant" form lets the visitor pick a Sender or type a new one
- [ ] Reset restores the seeded state
- [ ] Two browsers' sandboxes are fully independent, and the server stores nothing
