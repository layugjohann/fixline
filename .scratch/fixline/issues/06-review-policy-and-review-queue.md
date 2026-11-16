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
- [ ] A Proposal with an emergency plus a review trigger (cross-Tenant match, unknown Sender, uncertain flag, or Draft Reply) is split per ADR 0003: only the emergency creates are applied and flagged, and the other operations go to the Review Queue
- [ ] The Review Queue UI lists pending Proposals with the triggering rule, and approve/reject work
- [ ] A routing grader is added to the eval harness
- [ ] Scenarios cover the cross-Tenant ceiling leak, an unknown Sender, and an uncertain Message

## Comments

Usage: Implementer 66 input, 48,784 output, 123,241 cache creation, 2,876,964 cache read; Review Session 8 input, 4,012 output, 60,214 cache creation, 216,635 cache read.

**Review Session: Non-critical Findings**

- decideRouting gives the emergency rule precedence over the whole Proposal. An emergency Proposal that also has a cross-Tenant attach, or that comes from a Sender not in the Property Roster, is applied in full before a Coordinator sees it. The Coordinator can only acknowledge it afterwards, so the non-emergency cross-Tenant match skips review. This is defensible (one Proposal per Message, and it is flagged), but it should be a deliberate decision.
- Coordinator actions (approveProposal, rejectProposal, acknowledgeEmergency) are exported from @/intake as entry points alongside runIntake. That's reasonable, but it stretches the 'single Intake entry point' standard and is worth noting in the Spec or ADR.
- Duplicated test helpers: usage, toolCallTurn and scriptedModel are redeclared in review-routing.test.ts, intake.test.ts and evals.test.ts. A shared test helper would remove this.
- The private helper in src/intake/review-policy.ts is named `describe`, which is vague and reads like the test framework's function. A name like describeRules would be clearer.
- Several runIntake calls in intake.test.ts are now very long single lines (the reviewQueue argument was added inline). Formatting is inconsistent with the rest of the file.
- The unknown-Sender example in exampleMessages (src/fixtures/index.ts) repeats the body of the review-unknown-sender golden scenario word for word. They could share one definition.

**Review Session: Spec disagreement (not acted on)**

- ADR 0003 and the Spec don't define precedence when one Proposal holds an emergency plus something that must go to review (a cross-Tenant match, or a Sender not in the Property Roster). The implementation applies the whole Proposal immediately and flags it. The Spec should say whether that's intended, or whether the non-emergency operations should wait for review.
