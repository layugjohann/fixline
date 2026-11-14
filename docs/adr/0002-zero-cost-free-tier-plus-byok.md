# $0 to build and demo: free-tier models plus bring-your-own-key

This is a portfolio project, so developing it and running the public demo must cost nothing. The default model therefore runs on Groq's free tier (tool calling on every model, ~1K requests/day as of 2026-11), with Gemini's free tier as a fallback. Frontier models (Claude, OpenAI) are only used when a visitor pastes their own key (BYOK). Models sit behind a provider-agnostic interface (Vercel AI SDK), which also means the README can carry a cross-model eval scorecard.

## Consequences

- The public demo must rate-limit each visitor to stay inside the free daily quotas. The always-available default view is replay mode (recorded runs), not live runs.
- Free-tier inputs may be used for training by the provider (Gemini's terms say so). Only synthetic data ever goes to a free-tier model.
- Prompts and evals must hold up on smaller open-weight models, not just frontier ones.
