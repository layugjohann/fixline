import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/** Default free-tier model (ADR 0002). Override with GROQ_MODEL. */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export class ModelNotConfiguredError extends Error {
  constructor() {
    super("No model is configured. Set GROQ_API_KEY (see .env.example).");
    this.name = "ModelNotConfiguredError";
  }
}

/** The only place that names a model provider. Everything else takes a LanguageModel. */
export function defaultModel(env: NodeJS.ProcessEnv = process.env): LanguageModel {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new ModelNotConfiguredError();
  return createGroq({ apiKey })(env.GROQ_MODEL || DEFAULT_GROQ_MODEL);
}
