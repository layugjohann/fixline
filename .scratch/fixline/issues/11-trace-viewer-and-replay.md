# 11: Trace viewer + replay mode

**What to build:** Anyone can inspect an agent run step by step: model turns, tool calls with their inputs and outputs, the final Proposal, and the routing decision. Replay mode serves recorded traces as static data and needs no key or model. It is the default view of the demo.

**Blocked by:** 03

**Status:** in-progress

- [ ] The trace viewer renders every step of a trace produced by Intake or the eval runner
- [ ] Replay mode loads recorded traces with no model calls and no key
- [ ] Replay is the landing view of the web app
- [ ] There is a documented way to turn any saved trace into a replay

## Comments

Usage: Implementer 48 input, 23,082 output, 75,189 cache creation, 1,602,384 cache read; Review Session 10 input, 3,304 output, 47,654 cache creation, 239,665 cache read.

**Review Session: Non-critical Findings**

- The emergency-burst-pipe sample replay shows an emergency routed as plain auto-apply ('Clear new Work Order(s).') because the review policy is still a stub (Issue 06 reopened). The demo landing view therefore shows emergency handling that differs from the Spec. Re-run `npm run replay:samples` once the emergency rule lands.
- src/replays/files.ts replayFromTraceFile always reads `../scorecard.json` relative to the trace file, even for live-run responses. A stray scorecard.json in the parent directory would set the wrong recordedAt, and the wrong model when --model is omitted. Only read it for eval-run layouts (traces/<id>.json).
- src/replays/cli.ts: `if (!message) return 2;` exits silently with no error message. The branch is unreachable as written, so it is effectively dead code. Either remove it or give it a message.
- The scripted MockLanguageModelV4 helpers (the `usage` constant and the turn/tool-call builders) are duplicated between src/replays/record-samples.ts and src/replays/replays.test.ts, and probably intake.test.ts too. Share one helper.
- app/location-name.ts resolves names against the global fixture propertyRoster rather than the roster the replay's run used. Replays recorded against a different roster fall back to showing raw ids.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-11-2026-11-16T08-53-48-885Z.log`).

Usage: Body writer 2 input, 1,259 output, 42,452 cache creation, 11,370 cache read.
