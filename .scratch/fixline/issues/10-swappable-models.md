# 10: Swappable models

**What to build:** The model is chosen by configuration: Groq's free tier by default, Gemini's free tier as fallback, and Claude or OpenAI when a key is supplied (ADR 0002). Free-tier rate limits fail gracefully, with a clear error, a retry, or a fallback, and are never counted as agent failures in evals. The eval runner takes a model option.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] One provider-agnostic configuration selects Groq, Gemini, Claude or OpenAI
- [ ] Rate-limit and quota errors are detected and surfaced distinctly from agent errors
- [ ] The eval runner accepts a model option and records the model on its scorecard
- [ ] Evals mark scenarios that were rate-limited as not-run, not failed
