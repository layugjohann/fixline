import { locationId, type WorkOrderLocation } from "@/domain";
import { propertyRoster } from "@/fixtures";

/** A readable name for a Unit or Common Area, falling back to its id when it isn't in the Property Roster. */
export function locationName(location: WorkOrderLocation): string {
  for (const property of propertyRoster.properties) {
    if (location.type === "unit") {
      const unit = property.units.find((candidate) => candidate.id === location.unitId);
      if (unit) return `${property.name}, Unit ${unit.label}`;
    } else {
      const commonArea = property.commonAreas.find((candidate) => candidate.id === location.commonAreaId);
      if (commonArea) return `${property.name}, ${commonArea.name}`;
    }
  }
  return locationId(location);
}
