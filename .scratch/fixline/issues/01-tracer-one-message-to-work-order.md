# 01: Tracer: one Message becomes a Work Order on a page

**What to build:** A Sender's Message about a single problem goes through Intake and becomes a new Work Order on the fake Board, shown on a bare web page. This sets up the skeleton every later ticket builds on:
- the TypeScript/Next.js scaffold, with typecheck, lint, the test runner, and a CI workflow;
- minimal domain types;
- the in-memory fake Board and a Property Roster fixture;
- the Intake entry point, with an agent on Groq's free tier that has one read-only tool (look up the Sender) and submits a create-only Proposal through a final structured-output tool;
- the Proposal is auto-applied.

The page holds the sandbox state in the browser and sends it with each request, so the server stays stateless from day one (see spec, "Demo sandbox").

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [ ] The repo has `typecheck`, `lint` and `test` npm scripts (named exactly that; the Gate runs `npm run typecheck`, `npm run lint` and `npm test`), and CI runs all three on every push
- [ ] Domain types use glossary names (Message, Sender, Tenant, Unit, Property Roster, Work Order, Urgency, Trade, Proposal)
- [ ] Intake exposes one entry point that takes a Message and its dependencies (model, Board, Property Roster) and returns the Proposal, the routing decision and a trace
- [ ] The agent has read-only tools only. It cannot change the Board (ADR 0001)
- [ ] A deterministic Intake test using the AI SDK mock model asserts that a scripted create Proposal results in the expected Work Order on the fake Board
- [ ] Running the app locally with a Groq key, a hard-coded Message produces a visible Work Order on the page
- [ ] The server holds no sandbox state between requests

## Comments

Usage: Implementer 54 input, 23,003 output, 64,157 cache creation, 1,268,055 cache read; Review Session 6 input, 2,682 output, 176,373 cache creation, 384,277 cache read.

**Review Session: Non-critical Findings**

- Message is JSON.stringify'd inside <message> tags, but JSON.stringify does not escape '<'/'>', so a Message body containing '</message>' can close the delimiter early. Escaping '<' (e.g. \u003c) would make the data boundary unambiguous. Related to Issue 09.
- Until Proposal validation (Issue 07) lands, a Proposal referencing a non-existent unitId (e.g. from an unknown Sender) is auto-applied to the sandbox Board.
- package.json engines declares node >=20 while ai/@ai-sdk/* require >=22 and vitest requires >=22.12; the engines field should match.
- NoProposalError carries the partial trace steps, but the API route drops them, so the trace of a failed run is lost.
- decideRouting has two branches that both return 'auto-apply'; redundant until the real ADR 0003 rules arrive in Issue 06.
- When the submitted Proposal fails to parse, runAgent does not record the invalid submission in the trace steps, which makes failed runs harder to diagnose.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-01-2026-11-14T18-50-37-400Z.log`).

Usage: Body writer 2 input, 1,441 output, 173,497 cache creation, 11,370 cache read.
