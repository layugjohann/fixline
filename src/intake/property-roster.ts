import type { Property, PropertyRoster, Sender, Tenant, Unit } from "@/domain";

export type SenderLookup =
  | { found: true; tenant: Tenant; unit: Unit; property: Property }
  | { found: false };

/** Resolve a Sender to a Tenant via the Property Roster. Unknown Senders are a normal case. */
export function lookUpSender(roster: PropertyRoster, sender: Pick<Sender, "email">): SenderLookup {
  const email = sender.email.trim().toLowerCase();
  const tenant = roster.tenants.find((candidate) => candidate.email.toLowerCase() === email);
  if (!tenant) return { found: false };
  for (const property of roster.properties) {
    const unit = property.units.find((candidate) => candidate.id === tenant.unitId);
    if (unit) return { found: true, tenant, unit, property };
  }
  return { found: false };
}
