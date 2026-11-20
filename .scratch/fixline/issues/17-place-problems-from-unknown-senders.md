# 17: Place problems from unknown Senders

**What to build:** When the Sender isn't in the Property Roster but the Message says where the problem is, Intake creates the Work Order in that Location and sends it for review (ADR 0003), instead of drafting a "which unit?" reply. Today the agent can't do this. `lookUpSender` (src/intake/property-roster.ts) returns only `{ found: false }`, and no tool lists the Properties, Units or Common Areas. So the model can't turn "2A at Harbor View Apartments" into `harbor-view-2a`. Proposal validation rejects any Unit id that isn't on the roster, so guessing an id doesn't work either. The prompt says "Don't create a Work Order you can't place", so the "missing-unit" reply is the prompt's own rule working as written. The cross-model scorecard (Issue 15) put this down to `gpt-oss-120b`, but it's a tooling gap that a better model won't fix: `review-unknown-sender` and `split-unknown-sender-emergency-and-routine` fail for this reason.

Behaviour:
- A new read-only agent tool, `listProperties`, returns every Property in the Property Roster with its Units (id, label) and Common Areas (id, name). It returns no Tenant data, because the Sender is unverified and could be asking who lives where. `lookUpSender` is unchanged.
- The prompt tells the agent, when the Sender isn't in the Property Roster, to place each problem from the Message using `listProperties`. A problem is placed only if the Message names exactly one Unit or Common Area on the roster.
- If the named Location doesn't exist ("4C at Harbor View"), is ambiguous ("the lobby" when more than one Property has one, "2A" with no Property named), or isn't named at all, the agent creates nothing for that problem and drafts the "missing-unit" reply, as it does today.
- An unknown Sender alone is not a reason to set `uncertain`. The "unknown-sender" review rule already sends the Proposal to a Coordinator.
- New golden scenario: a Sender who isn't in the Property Roster reports an emergency in a named Common Area (for example, water pouring through the lobby ceiling at Quay Court). Expected: a create in that Common Area, routed `apply-and-flag` with "unknown-sender".
- Re-run the smoke evals on `groq:openai/gpt-oss-120b` (judge `groq:openai/gpt-oss-20b`), refresh the README scorecard, and reword the "Unknown Senders" bullet in Known weak spots as a fixed tooling gap rather than a model weakness. This needs real free-tier calls, so it's a step for the author if the Run's sandbox has no key.

**Blocked by:** 15

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/16

- [ ] `listProperties` returns every Property with its Units and Common Areas, and no Tenant data
- [ ] An unknown Sender who names exactly one Unit or Common Area on the roster gets a create in that Location, routed for review under "unknown-sender" and not flagged uncertain
- [ ] An unknown Sender who names no Location, one that doesn't exist, or an ambiguous one still gets the "missing-unit" Draft Reply and no create
- [ ] The new unknown-Sender Common Area emergency scenario is in the golden dataset
- [ ] Tests cover placing, not placing (missing, nonexistent, ambiguous) and the Common Area emergency with a mock model
- [ ] The README scorecard and Known weak spots reflect a re-run of the smoke evals

## Comments

Usage: Implementer 28 input, 9,328 output, 53,883 cache creation, 683,313 cache read; Review Session 22 input, 4,170 output, 35,747 cache creation, 447,241 cache read.

**Review Session: Non-critical Findings**

- The README scorecard and the 'Unknown Senders' bullet in Known weak spots haven't been refreshed from a re-run of the smoke evals on groq:openai/gpt-oss-120b (judge gpt-oss-20b). The Issue leaves this to the author because it needs real free-tier calls, so that acceptance criterion is still open.
- README.md still says the dataset has 78 scenarios (lines 60 and 70); adding unknown-sender-common-area-emergency makes it 79.
- src/intake/unknown-sender.test.ts copies the mock-model helpers (usage, toolCallTurn) that five other test files already define, instead of sharing one helper. It follows the existing pattern but adds more duplication.
- Not introduced here: the prompt tells the agent to set uncertain=true for a 'missing-unit' reply, but the draft-reply-missing-unit golden scenario expects routing rules ['unknown-sender', 'draft-reply'] without 'uncertain'. It passes only because the routing grader checks that the expected rules are a subset of the actual ones. Worth making the two agree.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-17-2026-11-20T15-53-50-962Z.log`).

Usage: Body writer 2 input, 1,373 output, 23,025 cache creation, 11,842 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/16
