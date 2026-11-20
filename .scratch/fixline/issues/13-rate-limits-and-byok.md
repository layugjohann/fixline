# 13: Live-mode rate limits + bring-your-own-key box

**What to build:** Live mode on the shared free-tier key is limited per visitor and capped globally per day, using Upstash Redis's free tier, so the demo stays at $0. A visitor who hits a limit sees a friendly message pointing to replay mode or bringing their own key. Visitors can paste their own Claude or OpenAI key, which is used only for that request and never stored or logged.

**Blocked by:** 10, 12

**Status:** done
**Pull Request:** https://github.com/layugjohann/fixline/pull/14

- [ ] Per-visitor and global daily caps are enforced for shared-key live runs
- [ ] When a limit is hit, the visitor sees guidance towards replay and bring-your-own-key, not an error page
- [ ] Bring-your-own-key requests skip the shared quota and use the visitor's chosen model
- [ ] The visitor's key is never persisted server-side or written to logs (verified by test or review)
- [ ] The Upstash credentials are added through the setup wizard

## Comments

Usage: Implementer 48 input, 26,275 output, 78,373 cache creation, 1,516,931 cache read; Review Session 12 input, 5,602 output, 50,689 cache creation, 282,945 cache read.

**Review Session: Non-critical Findings**

- src/live/own-key.ts, src/live/index.ts and app/live/sandbox-view.tsx name specific providers ('claude', 'openai', 'Claude (Anthropic)', 'OpenAI', and 'groq:shared' in tests). The Structure rule says no module outside model configuration names a provider. The own-key provider list and labels could be derived from or live in src/models.
- runOnOwnKey redacts the key by calling replaceAll on the JSON-serialised body. If the key contains a character JSON escapes (" or \ or a control character), its escaped form wouldn't match and a provider error quoting it would be returned unredacted. Real keys don't contain these characters, and the response only goes back to the visitor who sent the key, but redacting JSON.stringify(key).slice(1, -1) as well would close the gap.
- providerStatus in src/live/index.ts repeats the RetryError → lastError → APICallError unwrapping already in src/models (toModelRateLimitError and classifyRateLimit). That is duplicated logic; a shared helper in models would remove it.
- When the visitor's own key is rate-limited by their provider, they get ModelRateLimitError's quota message, which suggests 'use another model or your own key'. That advice doesn't fit someone already using their own key.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-13-2026-11-17T09-24-55-179Z.log`).

Usage: Body writer 2 input, 1,271 output, 35,364 cache creation, 11,457 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/14
