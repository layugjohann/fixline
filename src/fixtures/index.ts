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
      commonAreas: [
        { id: "harbor-view-lobby", propertyId: "harbor-view", name: "Lobby" },
        { id: "harbor-view-laundry-room", propertyId: "harbor-view", name: "Laundry room" },
        { id: "harbor-view-stairwell", propertyId: "harbor-view", name: "Stairwell" },
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
      commonAreas: [
        { id: "quay-court-lobby", propertyId: "quay-court", name: "Lobby" },
        { id: "quay-court-bike-store", propertyId: "quay-court", name: "Bike store" },
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
      id: "tenant-sam",
      name: "Sam Whitfield",
      email: "sam.whitfield@example.com",
      unitId: "harbor-view-1a",
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

/**
 * Example Messages the page can send through Intake, one per routing outcome
 * a live model should reach: auto-apply, review (unknown Sender), and an emergency.
 */
export const exampleMessages: Message[] = [
  tracerMessage,
  MessageSchema.parse({
    id: "msg-example-unknown-sender",
    sender: { email: "m.okafor.home@example.org", name: "Maya O." },
    receivedAt: "2026-11-15T10:30:00Z",
    body:
      "Hi, writing from my personal email. I'm in 2A at Harbor View Apartments. The towel rail in the bathroom " +
      "has come loose from the wall, one of the screws has pulled out. No rush, whenever someone is around.",
  }),
  MessageSchema.parse({
    id: "msg-example-emergency",
    sender: { email: "priya.nair@example.com", name: "Priya Nair" },
    receivedAt: "2026-11-15T22:05:00Z",
    body: "URGENT the pipe under my kitchen sink has burst and water is pouring onto the floor. Please send someone now!",
  }),
  // An emergency plus a review trigger: the emergency is applied and flagged, the rest waits for review.
  MessageSchema.parse({
    id: "msg-example-emergency-unknown-sender",
    sender: { email: "m.okafor.home@example.org", name: "Maya O." },
    receivedAt: "2026-11-15T23:10:00Z",
    body:
      "Writing from my personal email, I'm in 2A at Harbor View Apartments. Water is gushing out from under the " +
      "bathroom sink and the floor is flooding, I can't stop it! Separately, and not urgent at all, the latch on " +
      "my bedroom window is loose.",
  }),
];
