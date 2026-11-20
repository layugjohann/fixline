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

/** One Property as `listProperties` shows it: its Units and Common Areas, never its Tenants. */
export interface PropertyListing {
  id: string;
  name: string;
  address: string;
  units: { id: string; label: string }[];
  commonAreas: { id: string; name: string }[];
}

/**
 * Every Property in the Property Roster with its Units and Common Areas, so the agent can place a
 * problem from a Sender who isn't in the Property Roster. It returns no Tenant data: the Sender is
 * unverified and could be asking who lives where.
 */
export function listProperties(roster: PropertyRoster): PropertyListing[] {
  return roster.properties.map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
    units: property.units.map((unit) => ({ id: unit.id, label: unit.label })),
    commonAreas: property.commonAreas.map((area) => ({ id: area.id, name: area.name })),
  }));
}
