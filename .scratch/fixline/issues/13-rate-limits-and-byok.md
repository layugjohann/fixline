# 13: Live-mode rate limits + bring-your-own-key box

**What to build:** Live mode on the shared free-tier key is limited per visitor and capped globally per day, using Upstash Redis's free tier, so the demo stays at $0. A visitor who hits a limit sees a friendly message pointing to replay mode or bringing their own key. Visitors can paste their own Claude or OpenAI key, which is used only for that request and never stored or logged.

**Blocked by:** 10, 12

**Status:** ready-for-agent

- [ ] Per-visitor and global daily caps are enforced for shared-key live runs
- [ ] When a limit is hit, the visitor sees guidance towards replay and bring-your-own-key, not an error page
- [ ] Bring-your-own-key requests skip the shared quota and use the visitor's chosen model
- [ ] The visitor's key is never persisted server-side or written to logs (verified by test or review)
- [ ] The Upstash credentials are added through the setup wizard
