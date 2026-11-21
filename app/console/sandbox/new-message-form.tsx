"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Sender } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { locationName } from "../../location-name";
import { selectClass } from "./own-key-form";

/** The form's choice for a Sender who isn't in the Property Roster. */
const NEW_SENDER = "new-sender";

/** Send a Message as a Tenant from the Property Roster, or as anyone else. */
export function NewMessageForm({ busy, onSend }: { busy: boolean; onSend: (sender: Sender, body: string) => void }) {
  const [choice, setChoice] = useState(propertyRoster.tenants[0]?.id ?? NEW_SENDER);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const tenant = propertyRoster.tenants.find((candidate) => candidate.id === choice);
  const ready = body.trim() !== "" && (tenant !== undefined || email.trim() !== "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSend(tenant ? { email: tenant.email, name: tenant.name } : { email, name }, body);
    setBody("");
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="new-message-sender">Sender</Label>
        <select id="new-message-sender" className={selectClass} value={choice} onChange={(event) => setChoice(event.target.value)}>
          {propertyRoster.tenants.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({locationName({ type: "unit", unitId: candidate.unitId })})
            </option>
          ))}
          <option value={NEW_SENDER}>Someone not in the Property Roster…</option>
        </select>
      </div>
      {!tenant && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="new-message-email">Email</Label>
            <Input id="new-message-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-message-name">Name (optional)</Label>
            <Input id="new-message-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="new-message-body">Message</Label>
        <Textarea
          id="new-message-body"
          rows={5}
          className="min-h-28"
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="The heater is dead AGAIN and the kitchen tap drips…"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !ready}>
          <Send /> {busy ? "Working…" : "Send and run Intake"}
        </Button>
      </div>
    </form>
  );
}
