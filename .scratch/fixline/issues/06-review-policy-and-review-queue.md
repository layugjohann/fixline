# 06: Review policy + Review Queue

**What to build:** Every Proposal is routed by fixed rules (ADR 0003):
- auto-apply clear new routine/urgent Work Orders and obvious same-Tenant matches;
- send to the Review Queue anything flagged uncertain, any match to a Work Order raised by a different Tenant, and any Message from a Sender not in the Property Roster;
- apply emergencies immediately and flag them for a Coordinator.

The page shows the Review Queue, where a Coordinator can approve or reject each Proposal and sees which rule sent it there.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The Proposal carries the categorical labels the policy reads (Urgency, match type, uncertain flag). There is no numeric confidence
- [ ] Each routing rule has a deterministic test using the mock model
- [ ] An emergency is on the Board immediately and also flagged to the Coordinator
- [ ] The Review Queue UI lists pending Proposals with the triggering rule, and approve/reject work
- [ ] A routing grader is added to the eval harness
- [ ] Scenarios cover the cross-Tenant ceiling leak, an unknown Sender, and an uncertain Message
