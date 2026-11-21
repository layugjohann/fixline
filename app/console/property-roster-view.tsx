import { Building2, DoorOpen, Mail, Phone, Users } from "lucide-react";
import type { PropertyRoster } from "@/domain";

/** The Property Roster, read-only: each Property with its Units (and their Tenants) and Common Areas. */
export function PropertyRosterView({ roster, badge }: { roster: PropertyRoster; badge: string }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Property Roster</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{badge}</span>
          </div>
          <p className="mt-1 text-muted-foreground">
            Harbor Lane&apos;s Properties, Units, Common Areas and Tenants. The agent looks Senders and Locations up
            here; it&apos;s read-only.
          </p>
        </header>

        {roster.properties.map((property) => {
          const headingId = `property-${property.id}`;
          return (
            <section key={property.id} aria-labelledby={headingId} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
                <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={headingId} className="font-semibold">
                    {property.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">{property.address}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {property.units.length} Units · {property.commonAreas.length} Common Areas
                </span>
              </header>

              <div className="grid gap-6 p-4 md:grid-cols-[2fr_1fr]">
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Users className="size-3.5" /> Units and Tenants
                  </h3>
                  <table aria-label={`${property.name} Units`} className="w-full text-left">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-1.5 pr-4 font-medium">Unit</th>
                        <th className="py-1.5 pr-4 font-medium">Tenant</th>
                        <th className="py-1.5 font-medium">Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {property.units.map((unit) => {
                        const tenants = roster.tenants.filter((tenant) => tenant.unitId === unit.id);
                        return (
                          <tr key={unit.id} className="border-b align-top last:border-0">
                            <td className="py-2 pr-4 font-mono">{unit.label}</td>
                            <td className="py-2 pr-4">
                              {tenants.length === 0 ? (
                                <span className="text-muted-foreground">No Tenant listed</span>
                              ) : (
                                tenants.map((tenant) => (
                                  <span key={tenant.id} className="block">
                                    {tenant.name}
                                  </span>
                                ))
                              )}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground">
                              {tenants.map((tenant) => (
                                <span key={tenant.id} className="block space-y-0.5">
                                  <span className="flex items-center gap-1">
                                    <Mail className="size-3" /> {tenant.email}
                                  </span>
                                  {tenant.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="size-3" /> {tenant.phone}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <DoorOpen className="size-3.5" /> Common Areas
                  </h3>
                  <ul aria-label={`${property.name} Common Areas`} className="flex flex-wrap gap-2">
                    {property.commonAreas.map((commonArea) => (
                      <li key={commonArea.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {commonArea.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
