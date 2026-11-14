import { MessageSchema, PropertyRosterSchema, type Message, type PropertyRoster } from "@/domain";

/** Harbor Lane's Property Roster (synthetic data only). */
export const propertyRoster: PropertyRoster = PropertyRosterSchema.parse({
  properties: [
    {
      id: "harbor-view",
      name: "Harbor View Apartments",
      address: "12 Harbor Lane",
      units: [
        { id: "harbor-view-1a", propertyId: "harbor-view", label: "1A" },
        { id: "harbor-view-2a", propertyId: "harbor-view", label: "2A" },
        { id: "harbor-view-3b", propertyId: "harbor-view", label: "3B" },
      ],
    },
    {
      id: "quay-court",
      name: "Quay Court",
      address: "40 Quay Street",
      units: [
        { id: "quay-court-101", propertyId: "quay-court", label: "101" },
        { id: "quay-court-102", propertyId: "quay-court", label: "102" },
      ],
    },
  ],
  tenants: [
    {
      id: "tenant-maya",
      name: "Maya Okafor",
      email: "maya.okafor@example.com",
      phone: "+1 555 0101",
      unitId: "harbor-view-2a",
    },
    {
      id: "tenant-luis",
      name: "Luis Romero",
      email: "luis.romero@example.com",
      unitId: "harbor-view-3b",
    },
    {
      id: "tenant-priya",
      name: "Priya Nair",
      email: "priya.nair@example.com",
      unitId: "quay-court-101",
    },
  ],
});

/** The hard-coded Message the tracer page sends through Intake. */
export const tracerMessage: Message = MessageSchema.parse({
  id: "msg-tracer-1",
  sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
  receivedAt: "2026-11-15T09:12:00Z",
  body:
    "Hi, the kitchen sink tap in my flat has been dripping constantly since the weekend " +
    "and now there's a small puddle under the cabinet every morning. Could someone take a look? Thanks, Maya",
});
