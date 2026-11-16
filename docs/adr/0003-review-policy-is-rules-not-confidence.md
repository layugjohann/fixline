# Review routing is decided by fixed rules, not by the model's confidence score

Whether a Proposal is applied automatically or sent to the Review Queue is decided by deterministic rules in code. The rules read the agent's categorical labels (Urgency, match type, an explicit "uncertain" flag), not a numeric confidence the model reports about itself, because LLM self-reported confidence is poorly calibrated. The current rules:
- Auto-apply clear new routine/urgent Work Orders, and obvious matches to an existing Work Order from the same Tenant.
- Send to review: anything flagged uncertain, any match to a Work Order raised by a different Tenant, any Message from a sender not in the Property Roster, and every Draft Reply.
- Emergencies are applied immediately and also flagged for a human.

When one Proposal triggers both the emergency rule and a review rule, the Proposal is split. Only the operations that create emergency Work Orders are applied immediately and flagged. Every other operation in the Proposal goes to the Review Queue under the rules that sent it there. So an emergency doesn't wait for review, and it doesn't carry a cross-Tenant match or an unknown Sender's other changes onto the Board unchecked. The split applies to every review rule:
- **Unknown Sender:** an emergency from a Sender not in the Property Roster is still created, because a gas leak reported by a visitor must reach the Board. The Sender's other operations wait for review.
- **Uncertain:** if the agent flags a Proposal as uncertain and it contains an emergency, the emergency is still created and flagged. The Coordinator handles any doubt about it after the fact.
- **Draft Replies:** these always go to review, including Draft Replies that accompany an emergency.

So a single Proposal can end up partly applied: the emergency operations are on the Board while the rest are pending in the Review Queue.
