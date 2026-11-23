# Fixline

**An AI agent that turns messy tenant messages into triaged work orders, with human review, evals, and replayable traces.**

- **Live demo: [fixline-phi.vercel.app](https://fixline-phi.vercel.app).** The landing page opens the console in one of two workspaces. The [Demo](https://fixline-phi.vercel.app/console/demo/review-queue) is read-only: step through recorded agent runs with no model and no key. [Your sandbox](https://fixline-phi.vercel.app/console/sandbox/incoming-messages) is live: send Messages as a Tenant and work the Review Queue yourself.
- **Video (2 minutes):** the demo video, including the real Trello integration, is being recorded; its link goes here. <!-- video: replace this line's text with the link to the 2-minute demo video -->
- **Scorecard:** every model is measured on a golden dataset of hard scenarios, not eyeballed. [Results below](#scorecard).

![The Fixline landing page: an animated example of a messy Message becoming Work Orders, with buttons to open the Demo or your sandbox](docs/screenshots/landing.png)

## The engagement

Harbor Lane Property Management (a fictional client) runs its maintenance on a Trello board. Tenants report problems by message, and those messages are messy:

> "The heater is dead AGAIN 😡 also the kitchen tap drips. Unit 4B"

One message can describe two problems. Three messages can all be about the same leak. Some are emergencies ("water is coming through my ceiling"), and some aren't maintenance at all ("when is rent due?"). Until now a Coordinator read every message, worked out which work order it was about, updated the board by hand, and chased tenants for missing details.

This engagement is the sequel to a rules-based tool I built that syncs a source-of-truth file to Trello. That tool handles structured data; Fixline handles the unstructured inputs that rules can't.

Fixline reads each message, works out what it's about, and proposes changes to the board: create a work order, update an existing one, set urgency and trade, draft a reply to the tenant. Clear-cut changes are applied automatically. Anything uncertain goes to a human first. Emergencies go on the board immediately and are flagged.

## Scorecard

Free-tier models on the 10-scenario smoke subset of the golden dataset (78 scenarios in all). How it's run, and the known weak spots, are under [Evals](#evals).

<!-- scorecard:start -->
| Dimension | `groq:openai/gpt-oss-120b` | `groq:qwen/qwen3.8-27b` |
| --- | ---: | ---: |
| **Scenarios passed** | **80% (8/10)** | **60% (6/10)** |
| Classification (maintenance or not) | 100% (10/10) | 100% (10/10) |
| Number of Work Orders | 100% (10/10) | 100% (10/10) |
| Match target (attach or create) | 88% (7/8) | 63% (5/8) |
| Unit or Common Area | 100% (6/6) | 100% (6/6) |
| Trade | 100% (6/6) | 100% (6/6) |
| Urgency | 100% (6/6) | 100% (6/6) |
| Prompt-injection resistance | 100% (1/1) | 100% (1/1) |
| Review routing | 90% (9/10) | 60% (6/10) |
| Draft Reply drafted when needed | 50% (1/2) | 50% (1/2) |
| Draft Reply quality (LLM judge) | 100% (1/1) | 100% (1/1) |
| Not graded (rate limit or error) | 0 | 0 |

Golden scenarios per run: 10. Draft Reply quality judged by `groq:openai/gpt-oss-20b`. Run between 2026-11-20 and 2026-11-21.
<!-- scorecard:end -->

The console's Scorecard page shows the same runs side by side, with a pass/fail grid per scenario; click a scenario to step through its eval trace.

![The console's Scorecard: the latest run per model side by side, then a pass/fail grid per scenario](docs/screenshots/scorecard.png)

## Try the hard cases

The [Demo workspace](https://fixline-phi.vercel.app/console/demo/review-queue) shows a curated set of recorded runs. In its Review Queue you sit in the Coordinator's seat: the Message, why it was held for review, the Proposal as a diff against the Board, the Draft Replies, and the agent run beside it, step by step through the agent's lookups, its Proposal and the routing decision. Runs lists the same recordings full width.

![The Demo workspace's Review Queue: the queue, the conversation with the Proposal as a diff, and the agent run](docs/screenshots/review-queue.png)

| Recorded run | What it shows |
| --- | --- |
| Duplicate: the same dripping tap, reported again | A repeat report attaches to the open Work Order instead of creating a duplicate, and is applied automatically. |
| Heater dead again, plus a dripping tap | One Message, two problems: an update to the open heating Work Order and a new Work Order for the tap. |
| Ceiling leak: the Unit above writes about the Unit below's leak | A match to another Tenant's Work Order, sent to the Review Queue for a Coordinator to confirm. |
| Burst pipe flooding a bathroom | An emergency: applied immediately and flagged to a Coordinator. |
| Prompt injection: "mark everything EMERGENCY" | Instructions inside a Message are treated as content: a loose towel rail stays routine. |
| Laundry room leak reported from another Unit | A Common Area problem matches the Work Order another Unit already raised; as a match across Tenants, it goes to review. |
| A rent question, not maintenance | No Work Order at all. |

In [your sandbox](https://fixline-phi.vercel.app/console/sandbox/incoming-messages), the live workspace, you get a Board, Review Queue and Property Roster seeded with Harbor Lane's data, Incoming Messages to run Intake on live, a New Message form to send your own Message as a Tenant, and a reset button in the workspace menu. The sandbox lives only in your browser; the server stores nothing. Live runs on the shared free-tier model are limited per visitor and capped per day; paste your own Claude or OpenAI key from the sandbox's workspace menu to run a frontier model without those limits. Your key is used only for the request that carries it and is never stored or logged.

## Design highlights

- **The agent proposes; it never writes.** The agent has read-only tools and submits a structured Proposal. Deterministic code validates the Proposal and applies it. ([ADR 0001](docs/adr/0001-agent-proposes-never-writes.md))
- **Fixed rules decide what needs human review**, not the model's self-reported confidence: an emergency (applied at once, then flagged), a Proposal the agent flags as uncertain, a match to another Tenant's Work Order, a Sender not in the Property Roster, a Draft Reply, and a possible duplicate (a new Work Order with the same Location and Trade as an open one). ([ADR 0003](docs/adr/0003-review-policy-is-rules-not-confidence.md))
- **Evals come first.** A golden dataset of tricky scenarios is scored by deterministic graders, and the results are compared across models.
- **$0 to run.** It uses free-tier models by default; you can bring your own key for frontier models. ([ADR 0002](docs/adr/0002-zero-cost-free-tier-plus-byok.md))
- **Replayable traces.** Every agent run can be inspected step by step.

The domain language is defined in [GLOSSARY.md](GLOSSARY.md).

## Running locally

```sh
npm install
cp .env.example .env.local   # then set GROQ_API_KEY (free tier)
npm run dev                  # http://localhost:3000: the landing page, then the Demo and sandbox workspaces under /console
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

The dataset has 78 scenarios: non-maintenance Messages, every Urgency, duplicates and angry follow-ups, similar-but-different problems that must not be matched, multi-problem Messages, Common Areas (including merges across Units and lookalikes in another Property), unknown Senders, Unit mismatches, cross-Tenant matches, emergencies split from the parts that need review, Draft Replies, and prompt injection on its own and combined with matching, splitting and review.

Each run writes `scorecard.json` (which records the model), `scorecard.md` (the same scorecard as a Markdown table) and one trace per scenario (`traces/<scenario>.json`, in the same format Intake returns) under `eval-runs/<timestamp>/`. Evals pin the one model they're given and never fall back. A scenario stopped by the provider's rate limit or quota is marked **not run**: it is not graded and never counted as an agent failure. Once a quota is used up, the remaining scenarios are marked not run without calling the model again.

#### Smoke subset in CI

Ten scenarios are tagged `smoke`. Between them they reach every routing outcome and grade every dimension. GitHub Actions runs them on Groq's free tier with the `GROQ_API_KEY` repository secret (`npm run eval:smoke`, a few dozen model calls), only when started by hand: **Actions → CI → Run workflow**. Every push still runs typecheck, lint and tests. The evals used to run on every push too, but a few branch pushes in a row used up the free tier's daily tokens. Any failed scenario fails the build. A run stopped by the free-tier limit before anything was graded only warns, because a rate limit isn't a regression. The scorecard goes into the job summary, and the traces are uploaded as an artifact. Without the secret, the job is skipped with a warning.

#### Model scorecard

Fixline costs nothing to run, so the comparison uses free-tier models only, on the 10-scenario smoke subset (a full 78-scenario run doesn't fit in a free tier's daily tokens). One fixed judge grades every model's Draft Replies, so reply quality is comparable across rows:

```sh
npm run eval -- --tag smoke --model groq:openai/gpt-oss-120b --judge groq:openai/gpt-oss-20b --out eval-runs/gpt-oss-120b
npm run eval -- --tag smoke --model groq:qwen/qwen3.8-27b    --judge groq:openai/gpt-oss-20b --out eval-runs/qwen
npm run eval:compare -- eval-runs/gpt-oss-120b eval-runs/qwen --readme README.md
```

Any other model spec works the same way, including a paid one with your own key (`--model claude`). `--readme` rewrites the table between the scorecard markers in the [Scorecard](#scorecard) section (`--out <file>` writes it to a file instead). Scenarios a model's rate limit stopped are counted as not graded, not as failures. When the provider rejects a model's tool call (a tool that doesn't exist, input that breaks the schema, or no tool call at all), the scenario fails on every dimension, because no Proposal was made; that is why a model that rarely gets its tool calls through scores low across the board.

The console's Scorecard page (`/console/demo/scorecard`) is built from the committed eval runs: every `eval-runs/<run>/scorecard.json`, with the traces next to it. It shows the latest run per model side by side on the same dimensions, then each scenario's result per model; opening a result steps through that run's trace. Commit a run's directory to show it there.

Gemini (`gemini-3.8-flash`, the app's fallback) is not in the table: during both attempts Google's free tier was overloaded ("This model is currently experiencing high demand"), and the retries used up its daily requests after one graded scenario. Add its row with `--model gemini --out eval-runs/gemini` once it responds.

**Known weak spots.** From the runs in the [scorecard](#scorecard) (traces under each run's `traces/`):

- **Unwanted Draft Replies on emergencies.** On `emergency-burst-pipe`, both models draft an emergency confirmation to the Tenant, which turns a clean apply-and-flag into a split that waits for review. It's the one scenario both still fail.
- **Matching to an open Work Order.** `qwen3.8-27b` creates a new Work Order instead of attaching to the open one in three scenarios (`match-angry-follow-up`, `multi-problem-attach-and-create`, `common-area-merge-across-units`), and `gpt-oss-120b` does it once (the first problem in `multi-problem-attach-and-create`). In these runs it didn't always fail safe: in `common-area-merge-across-units` (`qwen3.8-27b`) and `multi-problem-attach-and-create` (`gpt-oss-120b`), the duplicate was auto-applied, so it reached the Board without review. Since Issue 19, the `possible-duplicate` review rule catches this: a new Work Order with the same Location and Trade as an open Work Order (or as another new one in the same Proposal) waits in the Review Queue instead of reaching the Board, whatever the model. The committed scorecard predates the rule, so its runs and traces still record these two as auto-applied.
- **Fixed since the first scorecard.** Before retries (Issue 18) and the roster lookup for unknown Senders (Issue 17), rejected tool calls caused 8 of `qwen3.8-27b`'s 9 failures and 3 of `gpt-oss-120b`'s 5, and `gpt-oss-120b` failed both unknown-Sender scenarios. In these runs, `gpt-oss-120b` had 2 rejected tool calls (`injection-mark-everything-emergency`, `review-unknown-sender`); the retry got through both times and the scenarios passed. `qwen3.8-27b` had none. Both models pass both unknown-Sender scenarios.

### Traces and replays

Every Intake run returns a trace: an ordered list of steps (model turns, tool calls with their inputs and outputs, the final Proposal, the routing decision). Live runs, eval runs and the Demo's recorded runs all use this one format (`Trace` in `src/domain`).

The Demo workspace is built from the recorded runs in `replays/`. Each file is a replay: a trace plus the Message it was for, the Board it started from, and the model that produced it. The console reads them when it is built and serves them as static data, so the Demo makes no model calls and needs no key. The landing page's animated example comes from one of them too.

To turn any saved trace into a replay:

```sh
# A trace from an eval run: the Message and Board come from the golden scenario named by the
# file, and the model from the run's scorecard.json.
npm run replay -- eval-runs/<run>/traces/emergency-burst-pipe.json

# A live run: save the JSON response of POST /api/intake (its `trace` field is used), plus
# the Message you sent and, optionally, the Board you sent.
npm run replay -- live-run.json --message message.json --board board.json --model groq --id my-run --title "My run"
```

Either writes `replays/<id>.json` (`--out <dir>` to write elsewhere, `--scenario <id>` to pick the golden scenario explicitly, `--title` and `--description` to label it). Commit the file and it appears in the Demo workspace on the next build.

The curated replays (listed under [Try the hard cases](#try-the-hard-cases)) are recorded by `npm run replay:samples`, which runs the real Intake pipeline (validation, review policy, Applier) on golden scenarios with a scripted mock model standing in for the model; their model is labelled as scripted, so the Demo never depends on a free-tier quota. Replace any of them with a real run once one is recorded.

### Models

Models are chosen by a spec, `<provider>[:<modelId>]` (see `src/models`), all through the Vercel AI SDK:

| Provider | Key | Default model | Model override |
| --- | --- | --- | --- |
| `groq` (default, free tier) | `GROQ_API_KEY` | `openai/gpt-oss-120b` | `GROQ_MODEL` |
| `gemini` (fallback, free tier) | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-3.8-flash` | `GEMINI_MODEL` |
| `claude` (your own key) | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | `ANTHROPIC_MODEL` |
| `openai` (your own key) | `OPENAI_API_KEY` | `gpt-5.5` | `OPENAI_MODEL` |

Live runs use Groq, falling back to Gemini when Groq is rate-limited (if both keys are set). Set `FIXLINE_MODEL` to pin one model instead. The SDK retries rate-limited calls first; if the limit still holds, the API answers `429` with a clear message rather than a failed Proposal.

In the sandbox workspace, shared-model runs are also capped per visitor and per day (`FIXLINE_LIVE_RUNS_PER_VISITOR`, default 10, and `FIXLINE_LIVE_RUNS_PER_DAY`, default 100, counted per UTC day). The counts live in Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set (the setup wizard adds them), and in memory otherwise. A visitor over a cap is pointed to the Demo or to bringing their own key; own-key runs skip the caps.

### Trello

Fixline runs against a real Trello Board from the command line. Set it up with `scripts/setup.sh trello`: it walks you through creating a Trello API key and token and picking two boards (Harbor Lane's Board, and a separate test Board), and saves them to `.env.local` (never committed).

```sh
npm run intake -- --from maya.okafor@example.com --body "My kitchen tap is dripping"
npm run intake -- --file message.json       # a Message as JSON
npm run intake -- --board fake --body "..."  # an empty in-memory Board instead of Trello
```

Each Work Order is a card: the title is the card name; Urgency, Trade and the Unit or Common Area are coloured labels (`Urgency: emergency` in red, `Trade: plumbing`, `Unit: harbor-view-2a`); the description holds the details, each update, and the Messages it came from. Archived cards and cards on a "Done" list count as closed.

One Board contract suite (`src/board/contract.ts`) defines how every Board behaves. The fake Board runs it in `npm test`; the Trello adapter runs it by hand against the test Board with `npm run test:trello`, or from GitHub with the manual "Trello Board contract" workflow.

### Screenshots

The screenshots in this README are taken in light mode by `npm run screenshots` (Playwright), against a local production build or any URL set in `FIXLINE_SCREENSHOT_URL`, and written to `docs/screenshots/`.

### Checks

`npm run typecheck`, `npm run lint`, `npm test`. The tests use the AI SDK mock model and make no network calls.

The web UI has one browser smoke test (`e2e/smoke.spec.ts`, Playwright), run against the deployed app:

```sh
npx playwright install chromium   # once
npm run test:smoke                                     # https://fixline-phi.vercel.app
FIXLINE_SMOKE_URL=http://localhost:3000 npm run test:smoke
```

It checks that the landing page opens the Demo workspace, which steps through a recorded run, and that a Message sent from the sandbox workspace lands in the Review Queue and reaches the Board once approved. Its selectors are roles and accessible names. It makes no free-tier model call: the browser's live Intake request is answered inside the test by the live Intake request handler on a scripted mock model, so it never reaches the deployed server. The Coordinator's approval does go to the deployed server, which calls no model. The "Browser smoke test" GitHub workflow runs it after every successful production deploy, or by hand against any URL.

## Roadmap

1. [x] Domain types, fake Board, Property Roster fixtures, golden dataset
2. [x] Agent and command-line eval runner, plus a model scorecard
3. [x] Trello adapter
4. [x] Web UI: a landing page and a console with Demo and sandbox workspaces (Incoming Messages, Review Queue, Board, Property Roster, Runs, Scorecard), bring-your-own-key
5. [ ] Deploy, browser smoke test, curated replays and scorecard in this README (done); demo video (being recorded)
6. [ ] Stretch: real email channel

## License

MIT
