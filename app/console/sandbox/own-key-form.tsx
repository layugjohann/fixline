"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OWN_KEY_PROVIDERS, OWN_KEY_PROVIDER_LABELS, type OwnKeyProvider } from "@/live/own-key";

/** The visitor's own key, as typed into the own-key box. Kept in memory only, never saved. */
export interface OwnKeyInput {
  provider: OwnKeyProvider;
  apiKey: string;
  modelId: string;
}

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

/**
 * Bring your own key: a Claude or OpenAI key to run live Intake on a frontier model,
 * skipping the shared free-tier limits. The key is sent with each live request and
 * used only for it: it isn't saved in this browser or on the server.
 */
export function OwnKeyForm({
  ownKey,
  onChange,
  disabled,
}: {
  ownKey: OwnKeyInput;
  onChange: (next: OwnKeyInput) => void;
  disabled: boolean;
}) {
  const using = ownKey.apiKey.trim() !== "";
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="own-key-provider">Provider</Label>
          <select
            id="own-key-provider"
            className={selectClass}
            value={ownKey.provider}
            disabled={disabled}
            onChange={(event) => {
              const provider = OWN_KEY_PROVIDERS.find((candidate) => candidate === event.target.value);
              if (provider) onChange({ ...ownKey, provider });
            }}
          >
            {OWN_KEY_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {OWN_KEY_PROVIDER_LABELS[provider]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="own-key-model">Model (optional)</Label>
          <Input
            id="own-key-model"
            value={ownKey.modelId}
            disabled={disabled}
            placeholder="the provider's default"
            onChange={(event) => onChange({ ...ownKey, modelId: event.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="own-key-api-key">API key</Label>
        <Input
          id="own-key-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={ownKey.apiKey}
          disabled={disabled}
          onChange={(event) => onChange({ ...ownKey, apiKey: event.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {using
          ? `Live runs use your ${OWN_KEY_PROVIDER_LABELS[ownKey.provider]} key until you forget it or leave the page.`
          : "No key: live runs use the shared free-tier model."}
      </p>
      {using && (
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ ...ownKey, apiKey: "" })}>
          Forget key and use the shared model
        </Button>
      )}
    </div>
  );
}
