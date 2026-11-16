# Fixline

**An AI agent that turns messy tenant messages into triaged work orders, with human review, evals, and replayable traces.**

> 🚧 Under construction. See the [roadmap](#roadmap).
>
> **Demo:** [fixline-phi.vercel.app](https://fixline-phi.vercel.app) opens in replay mode: step through recorded agent runs with no model and no key. [Live mode](https://fixline-phi.vercel.app/live) runs the agent on one hard-coded Message.

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
npm run dev                  # replay mode at http://localhost:3000, live mode at /live
```

### Full setup and deploy

`scripts/setup.sh` is an interactive wizard. It walks you through the Groq and Gemini keys, writes `.env.local`, sets the GitHub Actions secrets, links the Vercel project, sets its production env vars, and deploys. It's safe to re-run: values you've already saved are kept.

```sh
./scripts/setup.sh
```

### Evals

The golden scenarios live in `src/evals/golden-scenarios.ts`. Each one has a starting Board, a Property Roster, a Message, and the expected Proposal. The runner sends each scenario through Intake against a fresh fake Board using the model chosen with `--model` (keys come from `.env.local`). Rule-based graders score classification, number of Work Orders, match target, location (Unit or Common Area), Trade, Urgency, prompt-injection resistance (whether the Proposal did anything a Message's injected instructions demanded), review routing, and whether a Draft Reply was drafted for the right purpose, and the runner prints a scorecard. Draft Reply quality is the one free-text dimension: an LLM judge grades each Draft Reply against the written rubric in `src/evals/draft-reply-rubric.ts` (one pass/fail verdict per criterion). The judge defaults to the model under test; pick another with `--judge` or `FIXLINE_JUDGE_MODEL`, or skip it with `--no-judge`. Run only the injection scenarios with `npm run eval -- --tag prompt-injection`.

```sh
npm run eval                                   # all scenarios
npm run eval -- --tag emergency                # filter by tag
npm run eval -- --scenario emergency-burst-pipe --out eval-runs/pipe
npm run eval -- --model gemini                 # another model: groq, gemini, claude, openai
npm run eval -- --model claude:claude-sonnet-5-5
npm run eval -- --tag draft-reply --judge claude:claude-sonnet-5-5   # judge Draft Replies with another model
```

Each run writes `scorecard.json` (which records the model) and one trace per scenario (`traces/<scenario>.json`, in the same format Intake returns) under `eval-runs/<timestamp>/`. Evals pin the one model they're given and never fall back. A scenario stopped by the provider's rate limit or quota is marked **not run**: it is not graded and never counted as an agent failure. Once a quota is used up, the remaining scenarios are marked not run without calling the model again.

### Traces and replays

Every Intake run returns a trace: an ordered list of steps (model turns, tool calls with their inputs and outputs, the final Proposal, the routing decision). Live runs, eval runs and replay all use this one format (`Trace` in `src/domain`).

Replay mode, the landing page, shows the recorded runs in `replays/`. Each file is a replay: a trace plus the Message it was for, the Board it started from, and the model that produced it. The page reads them when it is built and serves them as static data, so it makes no model calls and needs no key.

To turn any saved trace into a replay:

```sh
# A trace from an eval run: the Message and Board come from the golden scenario named by the
# file, and the model from the run's scorecard.json.
npm run replay -- eval-runs/<run>/traces/emergency-burst-pipe.json

# A live run: save the JSON response of POST /api/intake (its `trace` field is used), plus
# the Message you sent and, optionally, the Board you sent.
npm run replay -- live-run.json --message message.json --board board.json --model groq --id my-run --title "My run"
```

Either writes `replays/<id>.json` (`--out <dir>` to write elsewhere, `--scenario <id>` to pick the golden scenario explicitly, `--title` and `--description` to label it). Commit the file and it appears in replay mode on the next build.

The replays committed so far are samples recorded by `npm run replay:samples`, which runs Intake on golden scenarios with a scripted mock model; their model is labelled as scripted. Replace them with real runs as they are recorded.

### Models

Models are chosen by a spec, `<provider>[:<modelId>]` (see `src/models`), all through the Vercel AI SDK:

| Provider | Key | Default model | Model override |
| --- | --- | --- | --- |
| `groq` (default, free tier) | `GROQ_API_KEY` | `openai/gpt-oss-120b` | `GROQ_MODEL` |
| `gemini` (fallback, free tier) | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-flash-latest` | `GEMINI_MODEL` |
| `claude` (your own key) | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | `ANTHROPIC_MODEL` |
| `openai` (your own key) | `OPENAI_API_KEY` | `gpt-5.5` | `OPENAI_MODEL` |

Live runs use Groq, falling back to Gemini when Groq is rate-limited (if both keys are set). Set `FIXLINE_MODEL` to pin one model instead. The SDK retries rate-limited calls first; if the limit still holds, the API answers `429` with a clear message rather than a failed Proposal.

### Trello

Fixline runs against a real Trello Board from the command line. Set it up with `scripts/setup.sh trello`: it walks you through creating a Trello API key and token and picking two boards (Harbor Lane's Board, and a separate test Board), and saves them to `.env.local` (never committed).

```sh
npm run intake -- --from maya.okafor@example.com --body "My kitchen tap is dripping"
npm run intake -- --file message.json       # a Message as JSON
npm run intake -- --board fake --body "..."  # an empty in-memory Board instead of Trello
```

Each Work Order is a card: the title is the card name; Urgency, Trade and the Unit or Common Area are coloured labels (`Urgency: emergency` in red, `Trade: plumbing`, `Unit: harbor-view-2a`); the description holds the details, each update, and the Messages it came from. Archived cards and cards on a "Done" list count as closed.

One Board contract suite (`src/board/contract.ts`) defines how every Board behaves. The fake Board runs it in `npm test`; the Trello adapter runs it by hand against the test Board with `npm run test:trello`, or from GitHub with the manual "Trello Board contract" workflow.

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
