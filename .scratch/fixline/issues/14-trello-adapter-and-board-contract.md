# 14: Trello adapter + Board contract tests

**What to build:** Fixline works against a real Trello Board. A single contract test suite defines Board behaviour: the fake Board passes it in CI, and the Trello adapter passes it when triggered by hand against a dedicated test Board. A developer can run Intake from the command line against real Trello with their own credentials. Work Orders show on cards with Urgency, Trade, and Unit or Common Area clearly visible.

**Human step:** the author creates the Trello credentials and the test Board through the setup wizard.

**Blocked by:** 04

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/10

- [ ] One Board contract suite runs against the fake Board in CI
- [ ] The same suite passes against Trello when triggered by hand
- [ ] Work Order fields map onto Trello cards readably (labels, description or custom fields)
- [ ] A command-line command runs Intake on a Message against the configured Trello Board
- [ ] The Trello credentials are provisioned through the setup wizard and never committed

## Comments

Usage: Implementer 42 input, 36,971 output, 81,581 cache creation, 1,369,477 cache read; Review Session 10 input, 7,634 output, 47,830 cache creation, 214,666 cache read.

**Review Session: Non-critical Findings**

- scripts/setup.sh: ask_board writes TRELLO_TEST_BOARD_ID to .env.local before the loop checks that it differs from TRELLO_BOARD_ID. Quitting after giving the Harbor Lane Board leaves the contract tests pointed at the real Board, and on retry Enter keeps the wrong value, so the prompt repeats until a different Board is typed. The check compares raw input, so a Board given once as a URL and once as its full id gets past it.
- src/board/trello.ts findOrCreateLabel: if the first fetch of the Board's labels fails, labelsPromise keeps the failed result, so every later createWorkOrder on that instance fails. boardId() and labelId() retry after a failure; this doesn't.
- src/board/trello.ts: Trello limits card descriptions to 16,384 characters. Appending every update will eventually fail with a 400 TrelloApiError instead of a clear message.
- src/board/trello.ts parseCardDescription trims the description, so a description with leading or trailing whitespace reads back slightly different from what was created. The fake Board keeps it exact, and the contract suite doesn't cover this case.
- scripts/setup.sh json_field: when curl fails it parses empty input, so Node prints a JSON.parse stack trace (stderr isn't silenced) before the wizard's own warning.
- src/board/index.ts FakeBoard.closeWorkOrder repeats the find-or-throw lookup from appendToWorkOrder instead of sharing a helper.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-14-2026-11-16T09-02-46-218Z.log`).

Usage: Body writer 2 input, 1,384 output, 34,890 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/10
