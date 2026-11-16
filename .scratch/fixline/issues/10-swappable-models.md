# 10: Swappable models

**What to build:** The model is chosen by configuration: Groq's free tier by default, Gemini's free tier as fallback, and Claude or OpenAI when a key is supplied (ADR 0002). Free-tier rate limits fail gracefully, with a clear error, a retry, or a fallback, and are never counted as agent failures in evals. The eval runner takes a model option.

**Blocked by:** 03

**Status:** awaiting-merge
**Pull Request:** https://github.com/layugjohann/fixline/pull/7

- [ ] One provider-agnostic configuration selects Groq, Gemini, Claude or OpenAI
- [ ] Rate-limit and quota errors are detected and surfaced distinctly from agent errors
- [ ] The eval runner accepts a model option and records the model on its scorecard
- [ ] Evals mark scenarios that were rate-limited as not-run, not failed

## Comments

Usage: Implementer 58 input, 24,180 output, 70,000 cache creation, 1,714,277 cache read; Review Session 8 input, 4,036 output, 39,913 cache creation, 156,894 cache read.

**Review Session: Non-critical Findings**

- Gemini answers per-minute limits with RESOURCE_EXHAUSTED / 'exceeded your current quota', which QUOTA_PATTERN classifies as 'quota'. A `--model gemini` eval therefore stops and marks every remaining scenario not-run after one brief rate limit. Coverage is lost, but nothing is counted as a failure.
- classifyRateLimit (src/models/index.ts) matches RATE_LIMIT_PATTERN against the error message whatever the HTTP status, so e.g. a 400 whose text mentions 'rate limit' is treated as a rate limit.
- README says 'The SDK retries rate-limited calls first'. With both Groq and Gemini keys set, withRateLimitFallback catches the first 429 inside doGenerate and switches to Gemini immediately, so Groq is never retried.
- src/evals/cli.ts hardcodes the default provider "groq" and lists providers in its doc comment. The standards say no module outside model configuration names a provider; the default eval model spec belongs in src/models.
- The providerError test helper is duplicated in src/evals/evals.test.ts and src/models/models.test.ts.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-10-2026-11-16T07-53-08-128Z.log`).

Usage: Body writer 2 input, 1,623 output, 34,458 cache creation, 11,370 cache read.

**Pull Request opened**: https://github.com/layugjohann/fixline/pull/7
