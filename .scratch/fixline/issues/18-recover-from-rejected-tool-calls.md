# 18: Recover from rejected tool calls

**What to build:** When the model provider rejects the agent's own tool call, Intake tries again instead of giving up on the Message. Today `runAgent` (src/intake/agent.ts) lets the provider's 400 end the run, so the Message gets no Proposal. The cross-model scorecard (Issue 15) shows this is the most common failure on free-tier models: 8 of `qwen3.8-27b`'s 9 failed smoke scenarios and 3 of `gpt-oss-120b`'s 5.

The rejections seen in the eval traces, all reported by Groq as HTTP 400 and recognised by `rejectedToolCall` in src/models:
- a tool that doesn't exist, usually a misspelling: `lookUpSendeler`, `lookUpUsuario`, `searchOpenWorkorders`, `searchOpen.encodeWorkOrders`;
- input that breaks the tool's schema: `lookUpSender` without `email`, `submitProposal` with `uncertain` as a string;
- no tool call at all when one is required ("Tool choice is required, but model did not call a tool").

Behaviour:
- On a rejected tool call, run the turn again, telling the model what was rejected and why (the provider's explanation), and listing the tools that exist by their exact names. Keep the work the run had already done when that's possible; starting the Message again from the beginning is acceptable.
- Retry at most 2 times per Message. If the last try is rejected too, the eval grades the scenario as failed (Issue 15), and live mode (app/api/intake/route.ts) answers with a clear 502, "the model couldn't produce a valid Proposal", plus the trace (like the 422 for an InvalidProposalError), instead of the generic error. Today this error isn't caught there and the visitor gets a generic 500.
- The trace records each rejected call and each retry, so a replay shows what happened.
- Only rejected tool calls are retried. Rate limits and quotas keep their own handling (Issue 13), and other errors (a bad key, a server error) are not retried.
- Re-run the smoke evals on `groq:openai/gpt-oss-120b` and `groq:qwen/qwen3.8-27b` (judge `groq:openai/gpt-oss-20b`), refresh the README scorecard, and update the rejected-tool-call bullet in Known weak spots. This needs real free-tier calls, so it is a step for the author if the Run's sandbox has no key.

**Blocked by:** 15
**Stacked on:** issue/17-place-problems-from-unknown-senders

**Status:** in-progress

- [ ] A rejected tool call (unknown tool, schema mismatch, or no tool call) is retried with the provider's explanation and the list of real tool names, at most 2 times per Message
- [ ] A Message whose retry succeeds gets a normal Proposal and routing
- [ ] When every try is rejected, live mode returns a 502 with a clear message and the trace, not a 500
- [ ] Rate limits, quotas and other errors are not retried
- [ ] Each rejected call and retry appears in the trace
- [ ] Tests cover each kind of rejection with a mock model, using the provider messages from the Issue 15 traces
- [ ] The README scorecard and Known weak spots reflect a re-run of the smoke evals

## Comments

Usage: Implementer 50 input, 16,595 output, 66,883 cache creation, 1,459,594 cache read; Review Session 14 input, 3,901 output, 38,432 cache creation, 275,727 cache read.

**Review Session: Non-critical Findings**

- The README scorecard was not re-run with retries on (smoke evals on groq:openai/gpt-oss-120b and groq:qwen/qwen3.8-27b, judge groq:openai/gpt-oss-20b), so the acceptance criterion 'The README scorecard and Known weak spots reflect a re-run of the smoke evals' is still open. The Issue allows this as an author step when the sandbox has no key, and the Known weak spots bullet says the scorecard predates retries.
- src/intake/rejected-tool-calls.test.ts checks the text of the retry prompt (that it contains the provider explanation, the tool names and the kept lookUpSender result), which conflicts with the Testing standard 'Tests don't assert on prompts'. The Issue does require this behaviour, so it is a judgement call.
- The rejected-tool-call tests compare the exact sequence of trace steps, including tool names in order, which partly pins the order of tool calls that the Testing standards say tests shouldn't assert on.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-18-2026-11-20T15-58-56-630Z.log`).

Usage: Body writer 2 input, 1,510 output, 27,988 cache creation, 11,842 cache read.
