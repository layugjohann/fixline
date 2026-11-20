import type { Metadata } from "next";
import { propertyRoster } from "@/fixtures";
import { PropertyRosterView } from "../../property-roster-view";

export const metadata: Metadata = { title: "Property Roster · Demo · Fixline" };

export default function DemoPropertyRosterPage() {
  return <PropertyRosterView roster={propertyRoster} badge="Demo · recorded" />;
}
