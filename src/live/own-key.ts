/**
 * Bring your own key: what a demo visitor sends to run live mode on their own
 * Claude or OpenAI key instead of the shared free-tier one.
 *
 * Kept free of provider SDK imports so the browser can use it too. The key is
 * used only for the request that carries it: it is never stored, logged, traced
 * or sent back to the browser.
 */
import { z } from "zod";

export const OWN_KEY_PROVIDERS = ["claude", "openai"] as const;
export type OwnKeyProvider = (typeof OWN_KEY_PROVIDERS)[number];

export const OWN_KEY_PROVIDER_LABELS: Record<OwnKeyProvider, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
};

export const OwnKeySchema = z.object({
  provider: z.enum(OWN_KEY_PROVIDERS),
  apiKey: z.string().trim().min(1).max(512),
  /** The visitor's chosen model id; the provider's default when left out. */
  modelId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[\w.:/-]*$/, "Model ids contain only letters, digits, and . _ : / -")
    .optional()
    .transform((modelId) => modelId || undefined),
});
export type OwnKey = z.infer<typeof OwnKeySchema>;
