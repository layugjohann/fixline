# 19: Send possible duplicate Work Orders to review

**What to build:** A new review rule, `possible-duplicate`, so that a Work Order the agent creates instead of attaching to an open one waits in the Review Queue instead of reaching the Board unchecked. Today, when the model misses a match, it proposes a create. No match is proposed, so no rule fires, and the duplicate is auto-applied. The final scorecard (2026-11-22, README "Known weak spots") shows this twice:
- `eval-runs/qwen/traces/common-area-merge-across-units.json`: an appliance create in `harbor-view-laundry-room` while WO-5 (appliance, same Common Area) is open. Expected: attach to WO-5, sent to review as `cross-tenant-match`. Got: auto-apply.
- `eval-runs/gpt-oss-120b/traces/multi-problem-attach-and-create.json`: an hvac create in `harbor-view-3b` while WO-3 (hvac, same Unit) is open. Expected: attach to WO-3. Got: auto-apply.

This is a gap in the review policy, not only in weak models: even a model that rarely misses a match gets its misses through. The rule is a fixed, rule-based check in code with no model calls (ADR 0003).

Behaviour:
- **Match key.** A create operation triggers `possible-duplicate` if it has the same Location and the same Trade as an open Work Order on the Board, or as another create in the same Proposal. Same Location means the same Unit id, or the same Common Area id (`sameLocation` in src/domain). A Common Area is its own Location, whichever Unit the Sender lives in. A Unit create never matches a Common Area Work Order, or the reverse. Who raised the open Work Order and its Urgency don't matter. Closed Work Orders never match.
- **An ordinary rule.** Add `possible-duplicate` to `REVIEW_RULES` (src/domain/index.ts) and to `triggeredRules` (src/intake/review-policy.ts). It is listed alongside any other rules that trigger, and it isn't limited to Proposals that would otherwise auto-apply. Emergencies follow ADR 0003's existing split:
  - an emergency create that is itself a possible duplicate is still applied and flagged, and the flag shows `possible-duplicate`;
  - a non-emergency possible duplicate alongside an emergency waits in the Review Queue.
  
  When a Proposal is split, make sure the flagged and pending parts still carry the rule when it applies to their own creates. A match between two creates in the same Proposal must not be lost because the split separates them.
- **Where the open Work Orders come from.** Intake (src/intake/index.ts) reads the Board's open Work Orders (`board.listWorkOrders()` filtered to `status: "open"`) and passes them to `decideRouting` in a new `RoutingContext` field, for example `openWorkOrders`. `decideRouting` stays pure. The Coordinator's approval path doesn't re-run the rule, because the existing stale-Proposal check covers changes to the Board.
- **How it reads.**
  - `RULE_LABELS` (src/console/index.ts): "Same Location and Trade as an open Work Order"
  - `RULE_SHORT_LABELS`: "Possible duplicate"
  - The routing reason names the matching Work Order ids, for example: "It creates a Work Order where an open Work Order of the same Trade already exists (WO-5)." For a match within the Proposal, word it so it's clear the other one is in the same Proposal.
  
  The other rules' reasons are fixed strings (`RULE_REASONS`). This one is built from the matches. No new Review Queue UI: the Coordinator fixes a real duplicate with the existing Proposal editing (Issue 07), by turning the create into an attach, or rejects it.
- **Agent prompt and tools unchanged.** This is purely a review-policy change, so model behaviour and the committed scorecard stay comparable.
- **ADR.** Amend docs/adr/0003-review-policy-is-rules-not-confidence.md rather than writing a new ADR:
  - add `possible-duplicate` to the "Send to review" list;
  - add a short paragraph on why: it backstops missed matches whatever the model's quality, and it accepts false positives, such as a real second plumbing problem in a Unit with an open plumbing Work Order, because one Coordinator click is cheaper than a double dispatch;
  - mention how it combines with the emergency split.
- **Golden scenarios** (src/evals/golden-scenarios.ts). These three deliberately expect a correct new Work Order where an open one of the same Trade exists. Change their expected routing from auto-apply to `review("possible-duplicate")` and leave their expected operations as they are:
  - `no-match-different-fixture-same-unit` (plumbing in 2A, WO-2 open)
  - `routine-dripping-shower-head` (plumbing in 1A, WO-6 open)
  - `no-match-same-common-area-different-problem` (appliance in the laundry room, WO-5 open)
  
  `multi-problem-attach-and-create` and `common-area-merge-across-units` keep their expectations, because the correct answer is still an attach. Check the rest of the golden set for any other expectation the rule changes.
- **No eval re-run.** Don't re-run the scorecard. The committed `eval-runs/` stay as the historical record, because each one records its own routing decision. Update README "Known weak spots": a missed match now goes to review as `possible-duplicate` instead of reaching the Board. Note that the committed scorecard predates this rule. Update any README text that lists the review rules.
- Use GLOSSARY.md terms throughout.

**Blocked by:** none

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/25

- [ ] `possible-duplicate` is a review rule. A create with the same Location and Trade as an open Work Order, or as another create in the same Proposal, triggers it.
- [ ] Different Trade, different Location (including Unit vs Common Area), or a closed Work Order does not trigger it.
- [ ] It combines with the other rules and with the emergency split: an emergency is never held back, and the rule shows on the flag or on the pending part, wherever its create lands.
- [ ] Intake passes the Board's open Work Orders to `decideRouting`, which stays pure (no model calls, no Board reads).
- [ ] The routing reason names the matching Work Order id(s). The Review Queue shows the labels "Same Location and Trade as an open Work Order" and "Possible duplicate".
- [ ] Unit tests on `decideRouting` use the exact Proposals from the two traces above against their scenarios' Boards. Both go to review with `possible-duplicate`.
- [ ] Unit tests cover the negative cases above, a duplicate within one Proposal, an emergency possible duplicate, and a Proposal triggering several rules at once.
- [ ] A mock-model Intake test shows a missed-match create going to the Review Queue and not reaching the Board.
- [ ] The golden expectations for the three scenarios above are updated, and the eval tests pass.
- [ ] ADR 0003 is amended. README Known weak spots (and any list of review rules) reflect the rule, and say the scorecard predates it.
- [ ] The agent prompt and tools are unchanged, and no eval re-run is needed.

## Comments

Usage: Implementer 66 input, 25,005 output, 74,855 cache creation, 1,992,618 cache read; Review Session 32 input, 10,992 output, 56,511 cache creation, 881,767 cache read.

**Review Session: Non-critical Findings**

- Golden scenario injection-multi-problem-merge-into-one has two creates in quay-court-101 that both accept 'plumbing'. If the model picks plumbing for both, possible-duplicate fires and the expected AUTO_APPLY routing fails, so an answer the scenario accepts is graded wrong. Consider narrowing one Trade list. (emergency-carbon-monoxide-alarm and review-uncertain-damp-patch can also trigger the rule but still pass, because the routing grader allows extra rules.)

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-19-2026-11-23T15-00-20-294Z.log`).

Usage: Body writer 2 input, 1,561 output, 36,089 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/25
