# 06: Review policy + Review Queue

**What to build:** Every Proposal is routed by fixed rules (ADR 0003):
- auto-apply clear new routine/urgent Work Orders and obvious same-Tenant matches;
- send to the Review Queue anything flagged uncertain, any match to a Work Order raised by a different Tenant, and any Message from a Sender not in the Property Roster;
- apply emergencies immediately and flag them for a Coordinator.

The page shows the Review Queue, where a Coordinator can approve or reject each Proposal and sees which rule sent it there.

**Blocked by:** 04

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/8

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

Usage: Implementer 86 input, 24,345 output, 95,056 cache creation, 3,164,442 cache read; Review Session 10 input, 4,760 output, 69,844 cache creation, 323,200 cache read.

**Review Session: Non-critical Findings**

- Test helpers (usage, toolCallTurn, scriptedModel) are redeclared in review-routing.test.ts, intake.test.ts, evals.test.ts and models.test.ts; a shared test helper would remove the duplication.
- Many runIntake calls in intake.test.ts and models.test.ts are now very long single lines because reviewQueue was added inline, which doesn't match the multi-line formatting used elsewhere in those files.
- The routing check in GoldenScenarioSchema (src/evals/scenario.ts) is a five-level nested ternary. It's hard to read and would be clearer as a sequence of early returns or a small function.
- describeRouting in src/evals/graders.ts takes outcome: string and rules: readonly string[] instead of RoutingOutcome and ReviewRule[], which weakens its types for no reason.
- Work Orders without raisedByTenantId (legacy or seeded, such as existingWorkOrders WO-1) always count as cross-Tenant for a known Sender, so a genuine same-Tenant follow-up on one goes to review. This is conservative and safe, but undocumented.
- Coordinator actions (approveProposal, rejectProposal, acknowledgeEmergency) are exported from @/intake alongside runIntake, which stretches the 'single Intake entry point' standard. Worth recording in the Spec or an ADR.
- The unknown-Sender Message in exampleMessages (src/fixtures/index.ts) and the split example repeat the bodies of the review-unknown-sender and split-unknown-sender-emergency-and-routine golden scenarios word for word; they could share one definition.
- Proposal validation is not implemented yet (Issue 07), so with the new review routing an attach to a Work Order that doesn't exist reaches the Review Queue instead of being refused; approval then fails with a 409. This should be closed by Issue 07.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-06-2026-11-16T08-47-46-397Z.log`).

Usage: Body writer 2 input, 1,721 output, 63,644 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/8
