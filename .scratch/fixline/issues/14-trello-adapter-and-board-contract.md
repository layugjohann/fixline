# 14: Trello adapter + Board contract tests

**What to build:** Fixline works against a real Trello Board. A single contract test suite defines Board behaviour: the fake Board passes it in CI, and the Trello adapter passes it when triggered by hand against a dedicated test Board. A developer can run Intake from the command line against real Trello with their own credentials. Work Orders show on cards with Urgency, Trade, and Unit or Common Area clearly visible.

**Human step:** the author creates the Trello credentials and the test Board through the setup wizard.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] One Board contract suite runs against the fake Board in CI
- [ ] The same suite passes against Trello when triggered by hand
- [ ] Work Order fields map onto Trello cards readably (labels, description or custom fields)
- [ ] A command-line command runs Intake on a Message against the configured Trello Board
- [ ] The Trello credentials are provisioned through the setup wizard and never committed
