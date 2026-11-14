# 01: Tracer: one Message becomes a Work Order on a page

**What to build:** A Sender's Message about a single problem goes through Intake and becomes a new Work Order on the fake Board, shown on a bare web page. This sets up the skeleton every later ticket builds on:
- the TypeScript/Next.js scaffold, with typecheck, lint, the test runner, and a CI workflow;
- minimal domain types;
- the in-memory fake Board and a Property Roster fixture;
- the Intake entry point, with an agent on Groq's free tier that has one read-only tool (look up the Sender) and submits a create-only Proposal through a final structured-output tool;
- the Proposal is auto-applied.

The page holds the sandbox state in the browser and sends it with each request, so the server stays stateless from day one (see spec, "Demo sandbox").

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The repo has `typecheck`, `lint` and `test` npm scripts (named exactly that; the Gate runs `npm run typecheck`, `npm run lint` and `npm test`), and CI runs all three on every push
- [ ] Domain types use glossary names (Message, Sender, Tenant, Unit, Property Roster, Work Order, Urgency, Trade, Proposal)
- [ ] Intake exposes one entry point that takes a Message and its dependencies (model, Board, Property Roster) and returns the Proposal, the routing decision and a trace
- [ ] The agent has read-only tools only. It cannot change the Board (ADR 0001)
- [ ] A deterministic Intake test using the AI SDK mock model asserts that a scripted create Proposal results in the expected Work Order on the fake Board
- [ ] Running the app locally with a Groq key, a hard-coded Message produces a visible Work Order on the page
- [ ] The server holds no sandbox state between requests
