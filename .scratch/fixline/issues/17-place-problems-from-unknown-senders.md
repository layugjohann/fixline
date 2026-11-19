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

**Status:** ready-for-agent

- [ ] `listProperties` returns every Property with its Units and Common Areas, and no Tenant data
- [ ] An unknown Sender who names exactly one Unit or Common Area on the roster gets a create in that Location, routed for review under "unknown-sender" and not flagged uncertain
- [ ] An unknown Sender who names no Location, one that doesn't exist, or an ambiguous one still gets the "missing-unit" Draft Reply and no create
- [ ] The new unknown-Sender Common Area emergency scenario is in the golden dataset
- [ ] Tests cover placing, not placing (missing, nonexistent, ambiguous) and the Common Area emergency with a mock model
- [ ] The README scorecard and Known weak spots reflect a re-run of the smoke evals
