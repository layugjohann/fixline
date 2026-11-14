# Project Coding Standards

<!--
Rules specific to this codebase. The Review Session checks every change against them, on top of
the Preset layer (shipped with sandcastle-pro) and your Personal layer
(~/.config/sandcastle-pro/CODING_STANDARDS.md). When rules conflict, this file wins.

Write one rule per list item. Delete the headings you don't need, or add your own.
Text inside HTML comments, like this one, is ignored.

Breaking a rule in this file is a Non-critical Finding: it is logged on the Issue for you to decide.
Only rules under the "## Must" heading at the bottom are fixed automatically.

Sources: GLOSSARY.md, docs/adr/0001-0003, and the Implementation and Testing Decisions in
.scratch/fixline/spec.md.
-->

## Naming

- Domain types, variables and UI copy use the terms in `GLOSSARY.md` exactly: Message, Sender, Tenant, Coordinator, Property, Unit, Common Area, Property Roster, Work Order, Urgency, Trade, Proposal, Draft Reply, Review Queue, Board.
- Never use a glossary term's "Avoid" synonyms in code or copy: no `ticket`, `task`, `card` or `job` for a Work Order, no `priority` or `severity` for Urgency, no `category` for Trade, no `customer` or `user` for a Tenant.
- "Trello" and "card" appear only inside the Trello adapter. Everywhere else the concept is the Board and its Work Orders.
- Urgency values are exactly `emergency`, `urgent` and `routine`.

## Structure

- TypeScript throughout, with `strict` on. No `any`; parse untrusted input (model output, request bodies, fixtures) with a schema instead of casting it.
- Domain types live in one domain module. Other modules import them from there rather than redeclaring their shapes.
- Intake has a single entry point that takes a Message plus its dependencies (model, Board, Property Roster, Review Queue) and returns the Proposal, the routing decision and the trace. Callers (web routes, CLI, eval runner) go through it, not through its parts.
- Intake's parts stay separate: Agent, Proposal validation, review policy, Applier. The Agent never calls the Applier or the Board's write methods.
- Proposal validation runs before both the Board and the Review Queue, and checks that every referenced Work Order, Unit and Common Area exists.
- The Applier checks a Proposal against the current Board when applying it, and sends it back to the Review Queue on any conflict.
- Code reaches the Board only through the Board interface. Only the Trello adapter imports a Trello client.
- Models are reached only through the Vercel AI SDK's provider-agnostic interface. No module outside model configuration names a specific provider (Groq, Gemini, Anthropic, OpenAI).
- Channels stay outside Intake: Intake only ever sees a Message.
- Live runs, eval runs and replay share one serialisable trace format. Don't add a second one.
- The server holds no demo sandbox state. Each live-mode request carries the sandbox state it needs, and the response returns the result.
- Free-tier rate limits surface as a clear, typed error (or a retry or fallback), never as an empty or failed Proposal.

## Testing

- Tests exercise behaviour at the agreed seams: the Intake entry point and the Board interface. Given a Board state, a Property Roster and a Message, they assert what ends up on the Board, in the Review Queue, and in the returned Proposal and routing decision.
- Tests don't assert on prompts, internal helper functions or the order of tool calls.
- Deterministic Intake tests use the AI SDK's mock model, scripted to emit specific tool calls and Proposals. They never call a real model or the network.
- Every review-policy rule from ADR 0003 has a test that triggers it.
- The fake Board and the Trello adapter both pass one shared Board contract test suite. A change to the Board interface updates that suite.
- Trello contract tests run only when triggered by hand with credentials, against a dedicated test Board.
- Golden-dataset scenarios for a behaviour are written before the agent logic they measure.
- Eval graders are rule-based per dimension. An LLM judge is used only for Draft Reply quality.
- No React component tests. The web UI is covered by the single browser smoke test, which makes no free-tier model call.

## Must

<!--
Must Rules. Breaking one is a Critical Finding, which the Review Session fixes in the same pass,
so it costs tokens on every Issue that breaks it. Keep this list short: only rules worth that cost.
-->

- The agent's tools are read-only. Never give the agent a tool that creates, updates or deletes a Work Order or writes to the Board (ADR 0001). A new kind of change extends the Proposal schema and the Applier instead.
- Whether a Proposal is auto-applied, sent to the Review Queue or applied and flagged as an emergency is decided only by the fixed rules in the review policy, reading categorical labels. Never route on a numeric confidence score from the model (ADR 0003).
- Every Draft Reply goes to the Review Queue. Nothing marks a Draft Reply as sent without a Coordinator's approval.
- Message content reaches the model as clearly delimited data, never concatenated into instructions. A stored Message is never edited.
- A visitor's own API key is used only for the request that carries it. Never store, log or trace it, or send it back to the client.
- Never commit secrets or credentials (model keys, Upstash, Vercel, Trello). They come from environment variables.
- Only synthetic data goes to a free-tier model (ADR 0002).
