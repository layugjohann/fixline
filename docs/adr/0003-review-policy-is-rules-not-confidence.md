# Review routing is decided by fixed rules, not by the model's confidence score

Whether a Proposal is applied automatically or sent to the Review Queue is decided by deterministic rules in code. The rules read the agent's categorical labels (Urgency, match type, an explicit "uncertain" flag), not a numeric confidence the model reports about itself, because LLM self-reported confidence is poorly calibrated. The current rules:
- Auto-apply clear new routine/urgent Work Orders, and obvious matches to an existing Work Order from the same Tenant.
- Send to review: anything flagged uncertain, any match to a Work Order raised by a different Tenant, any Message from a sender not in the Property Roster, and every Draft Reply.
- Emergencies are applied immediately and also flagged for a human.
