# 11: Trace viewer + replay mode

**What to build:** Anyone can inspect an agent run step by step: model turns, tool calls with their inputs and outputs, the final Proposal, and the routing decision. Replay mode serves recorded traces as static data and needs no key or model. It is the default view of the demo.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The trace viewer renders every step of a trace produced by Intake or the eval runner
- [ ] Replay mode loads recorded traces with no model calls and no key
- [ ] Replay is the landing view of the web app
- [ ] There is a documented way to turn any saved trace into a replay
