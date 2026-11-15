# Fixline

**An AI agent that turns messy tenant messages into triaged work orders, with human review, evals, and replayable traces.**

> 🚧 Under construction. See the [roadmap](#roadmap).
>
> **Live tracer:** [fixline-phi.vercel.app](https://fixline-phi.vercel.app). Press "Run Intake" to turn one hard-coded Message into a Work Order.

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

### Full setup and deploy

`scripts/setup.sh` is an interactive wizard. It walks you through the Groq and Gemini keys, writes `.env.local`, sets the GitHub Actions secrets, links the Vercel project, sets its production env vars, and deploys. It's safe to re-run: values you've already saved are kept.

```sh
./scripts/setup.sh
```

### Evals

The golden scenarios live in `src/evals/golden-scenarios.ts`. Each one has a starting Board, a Property Roster, a Message, and the expected Proposal. The runner sends each scenario through Intake against a fresh fake Board using the configured model (`GROQ_API_KEY` from `.env.local`). Rule-based graders score classification, Unit, Trade and Urgency, and the runner prints a scorecard.

```sh
npm run eval                                   # all scenarios
npm run eval -- --tag emergency                # filter by tag
npm run eval -- --scenario emergency-burst-pipe --out eval-runs/pipe
```

Each run writes `scorecard.json` and one trace per scenario (`traces/<scenario>.json`, in the same format Intake returns) under `eval-runs/<timestamp>/`. Rate-limit errors are reported as errors and are not graded as agent failures.

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
