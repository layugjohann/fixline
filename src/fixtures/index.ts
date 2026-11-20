import { z } from "zod";
import {
  MessageSchema,
  PropertyRosterSchema,
  ReviewQueueEntrySchema,
  WorkOrderSchema,
  type Message,
  type PropertyRoster,
  type ReviewQueueEntry,
  type WorkOrder,
} from "@/domain";

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
 * a live model should reach: auto-apply, review (unknown Sender, or a Draft Reply asking for a
 * missing Unit), and an emergency.
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
  // No Unit given by a Sender not in the Property Roster: the agent drafts a reply asking for it.
  MessageSchema.parse({
    id: "msg-example-missing-unit",
    sender: { email: "jordan.lee@example.net", name: "Jordan Lee" },
    receivedAt: "2026-11-15T11:45:00Z",
    body:
      "Hi, the radiator in my bedroom has been stone cold for two days now and it's getting really chilly at night. " +
      "Can someone come and have a look? Thanks, Jordan",
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

// --- Demo sandbox seed ---------------------------------------------------------

/** The open Work Orders every demo sandbox's Board starts with. */
export const sandboxBoard: WorkOrder[] = z.array(WorkOrderSchema).parse([
  {
    id: "WO-1",
    location: { type: "unit", unitId: "harbor-view-1a" },
    title: "Water stain spreading on bathroom ceiling",
    description: "Brown water stain on the bathroom ceiling, getting bigger and dripping after showers upstairs.",
    trade: "plumbing",
    urgency: "urgent",
    status: "open",
    messageIds: ["msg-seed-sam-ceiling"],
    raisedByTenantId: "tenant-sam",
  },
  {
    id: "WO-2",
    location: { type: "common-area", commonAreaId: "harbor-view-lobby" },
    title: "Lobby ceiling light flickering",
    description: "The main ceiling light in the lobby flickers on and off in the evenings.",
    trade: "electrical",
    urgency: "routine",
    status: "open",
    messageIds: ["msg-seed-luis-lobby"],
    raisedByTenantId: "tenant-luis",
  },
  {
    id: "WO-3",
    location: { type: "unit", unitId: "quay-court-101" },
    title: "No heating in living room",
    description: "Living room radiator stays cold; the rest of the heating seems to work.",
    trade: "hvac",
    urgency: "urgent",
    status: "open",
    messageIds: ["msg-seed-priya-heating"],
    raisedByTenantId: "tenant-priya",
  },
]);

/** The Messages the seeded Board's Work Orders came from, so the Board can show them. */
export const sandboxBoardMessages: Message[] = z.array(MessageSchema).parse([
  {
    id: "msg-seed-sam-ceiling",
    sender: { email: "sam.whitfield@example.com", name: "Sam Whitfield" },
    receivedAt: "2026-11-12T08:30:00Z",
    body:
      "Hi, there's a brown stain on my bathroom ceiling and it's getting bigger. It drips a bit after whoever is " +
      "upstairs has a shower. Can someone take a look this week?",
  },
  {
    id: "msg-seed-luis-lobby",
    sender: { email: "luis.romero@example.com", name: "Luis Romero" },
    receivedAt: "2026-11-13T20:05:00Z",
    body: "FYI the big light in the lobby keeps flickering on and off in the evenings.",
  },
  {
    id: "msg-seed-priya-heating",
    sender: { email: "priya.nair@example.com", name: "Priya Nair" },
    receivedAt: "2026-11-09T17:45:00Z",
    body: "The radiator in my living room stays cold. The rest of the heating seems fine. Could someone check it?",
  },
]);

/** A Proposal already waiting for a Coordinator when a demo sandbox starts. */
export const sandboxReviewQueue: ReviewQueueEntry[] = z.array(ReviewQueueEntrySchema).parse([
  {
    id: "RQ-1",
    status: "pending",
    message: {
      id: "msg-seed-unknown-bike-store",
      sender: { email: "jo.tremaine@example.net", name: "Jo Tremaine" },
      receivedAt: "2026-11-14T18:40:00Z",
      body:
        "Hi, I've just moved into 102 at Quay Court. The lock on the bike store door doesn't catch any more, " +
        "so anyone can walk in. Not the end of the world but thought you should know.",
    },
    proposal: {
      classification: "maintenance",
      operations: [
        {
          type: "create",
          location: { type: "common-area", commonAreaId: "quay-court-bike-store" },
          title: "Bike store door lock doesn't catch",
          description: "The lock on the Quay Court bike store door no longer catches, so the door can't be secured.",
          trade: "locksmith",
          urgency: "routine",
        },
      ],
      uncertain: false,
      reasoning:
        "The Sender says they live in Unit 102 but isn't in the Property Roster. The problem is in a Common Area, " +
        "so the Work Order is for the bike store.",
    },
    routing: { outcome: "review", rules: ["unknown-sender"], reason: "The Sender isn't in the Property Roster." },
  },
]);

/**
 * The example Messages in every demo sandbox's Incoming Messages, waiting to be processed:
 * the routing examples above plus Messages about the seeded Board's Work Orders.
 */
export const incomingMessages: Message[] = [
  ...exampleMessages,
  ...z.array(MessageSchema).parse([
    {
      id: "msg-incoming-cross-tenant-leak",
      sender: { email: "maya.okafor@example.com", name: "Maya Okafor" },
      receivedAt: "2026-11-16T07:45:00Z",
      body:
        "Morning, the seal around my shower tray has gone black and cracked, and Sam downstairs says water is " +
        "coming through his bathroom ceiling. Could it be from mine?",
    },
    {
      id: "msg-incoming-lobby-follow-up",
      sender: { email: "sam.whitfield@example.com", name: "Sam Whitfield" },
      receivedAt: "2026-11-16T19:20:00Z",
      body: "The lobby light is flickering again tonight, it's like a strobe in there. Someone's going to trip.",
    },
    {
      id: "msg-incoming-angry-heating",
      sender: { email: "priya.nair@example.com", name: "Priya Nair" },
      receivedAt: "2026-11-16T08:02:00Z",
      body: "STILL no heating in the living room!! It's been a week and it's freezing. When is someone coming??",
    },
    {
      id: "msg-incoming-rent-question",
      sender: { email: "luis.romero@example.com", name: "Luis Romero" },
      receivedAt: "2026-11-16T12:15:00Z",
      body: "Hi, quick question: is rent due on the 1st or the 5th this month? Thanks, Luis",
    },
  ]),
];
