import type { Metadata } from "next";
import { propertyRoster } from "@/fixtures";
import { PropertyRosterView } from "../../property-roster-view";

export const metadata: Metadata = { title: "Property Roster · Your sandbox · Fixline" };

export default function SandboxPropertyRosterPage() {
  return <PropertyRosterView roster={propertyRoster} badge="Your sandbox · live" />;
}
