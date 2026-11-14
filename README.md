# Fixline

**An AI agent that turns messy tenant messages into triaged work orders, with human review, evals, and replayable traces.**

> 🚧 Under construction. See the [roadmap](#roadmap).

## The engagement

Harbor Lane Property Management (a fictional client) runs its maintenance on a Trello board. Tenants report problems by message, and those messages are messy:

> "The heater is dead AGAIN 😡 also the kitchen tap drips. Unit 4B"

One message can describe two problems. Three messages can all be about the same leak. Some are emergencies ("water is coming through my ceiling"), and some aren't maintenance at all ("when is rent due?").

Fixline reads each message, works out what it's about, and proposes changes to the board: create a work order, update an existing one, set urgency and trade, draft a reply to the tenant. Clear-cut changes are applied automatically. Anything uncertain goes to a human first.

This project is the sequel to a rules-based tool I built that syncs a source-of-truth file to Trello. That tool handles structured data; Fixline handles the unstructured inputs that rules can't.

## Design highlights

- **The agent proposes; it never writes.** The agent has read-only tools and submits a structured Proposal. Deterministic code validates the Proposal and applies it. ([ADR 0001](docs/adr/0001-agent-proposes-never-writes.md))
- **Fixed rules decide what needs human review**, not the model's self-reported confidence. ([ADR 0003](docs/adr/0003-review-policy-is-rules-not-confidence.md))
- **Evals come first.** A golden dataset of tricky scenarios is scored by deterministic graders, and the results are compared across models.
- **$0 to run.** It uses free-tier models by default; you can bring your own key for frontier models. ([ADR 0002](docs/adr/0002-zero-cost-free-tier-plus-byok.md))
- **Replayable traces.** Every agent run can be inspected step by step.

The domain language is defined in [GLOSSARY.md](GLOSSARY.md).

## Running locally

```sh
npm install
cp .env.example .env.local   # then set GROQ_API_KEY (free tier)
npm run dev                  # open http://localhost:3000 and press "Run Intake"
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`. The tests use the AI SDK mock model and make no network calls.

## Roadmap

1. [ ] Domain types, fake Board, Property Roster fixtures, golden dataset
2. [ ] Agent and command-line eval runner, plus a model scorecard
3. [ ] Trello adapter
4. [ ] Web UI: inbox, Review Queue, trace replay, bring-your-own-key
5. [ ] Deploy, demo video, scorecard in this README
6. [ ] Stretch: real email channel

## License

MIT
