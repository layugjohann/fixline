/**
 * The golden dataset: written before tuning the agent to pass it, so it defines
 * quality up front. Synthetic data only (ADR 0002).
 */
import type { WorkOrder } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { parseScenarios } from "./scenario";

const MAYA = { email: "maya.okafor@example.com", name: "Maya Okafor" }; // Harbor View 2A
const LUIS = { email: "luis.romero@example.com", name: "Luis Romero" }; // Harbor View 3B
const PRIYA = { email: "priya.nair@example.com", name: "Priya Nair" }; // Quay Court 101

/** An unrelated open Work Order, so scenarios don't all start from an empty Board. */
const existingWorkOrders: WorkOrder[] = [
  {
    id: "WO-1",
    unitId: "quay-court-102",
    title: "Broken window latch",
    description: "Bedroom window latch won't close.",
    trade: "carpentry",
    urgency: "routine",
    status: "open",
    messageIds: ["msg-seed-1"],
  },
];

export const goldenScenarios = parseScenarios([
  // --- Non-maintenance Messages -------------------------------------------
  {
    id: "not-maintenance-rent-question",
    description: "A rent question is not a maintenance matter and creates no Work Order.",
    tags: ["not-maintenance"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-rent-question",
      sender: MAYA,
      receivedAt: "2026-11-02T08:30:00Z",
      body: "Hi there, quick question: when is rent due this month, and can I pay by bank transfer instead of the portal? Thanks!",
    },
    expected: { classification: "not-maintenance", workOrders: [] },
  },
  {
    id: "not-maintenance-thank-you",
    description: "A thank-you for a finished repair mentions maintenance but asks for nothing.",
    tags: ["not-maintenance"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-thank-you",
      sender: LUIS,
      receivedAt: "2026-11-03T17:05:00Z",
      body: "Just wanted to say thanks to whoever fixed the bathroom tap on Tuesday. It's working perfectly now, really appreciate the quick turnaround.",
    },
    expected: { classification: "not-maintenance", workOrders: [] },
  },
  {
    id: "not-maintenance-noise-complaint",
    description: "A noise complaint about a neighbour is a Tenant matter, not a repair.",
    tags: ["not-maintenance"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-noise",
      sender: PRIYA,
      receivedAt: "2026-11-04T23:40:00Z",
      body: "The people upstairs are playing loud music again and it's nearly midnight. This is the third time this week. Can someone please talk to them?",
    },
    expected: { classification: "not-maintenance", workOrders: [] },
  },
  {
    id: "not-maintenance-spam-unknown-sender",
    description: "Marketing spam from a Sender who isn't in the Property Roster.",
    tags: ["not-maintenance", "unknown-sender"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-spam",
      sender: { email: "growth@seo-rockets.example.net", name: "SEO Rockets" },
      receivedAt: "2026-11-05T06:00:00Z",
      body: "Boost your property listings to page 1 of Google in 30 days! Reply YES for a free audit. Limited spots available.",
    },
    expected: { classification: "not-maintenance", workOrders: [] },
  },

  // --- Routine --------------------------------------------------------------
  {
    id: "routine-sticking-wardrobe-door",
    description: "A wardrobe door that sticks is a routine carpentry fix.",
    tags: ["routine", "simple-create"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-wardrobe",
      sender: LUIS,
      receivedAt: "2026-11-06T10:15:00Z",
      body: "Hello, the sliding wardrobe door in my bedroom keeps jumping off its track and sticking. Not a big deal, whenever someone's around is fine. Luis, 3B",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "harbor-view-3b", trade: "carpentry", urgency: "routine" }],
    },
  },
  {
    id: "routine-blown-bulb",
    description: "A blown ceiling bulb the Tenant can't reach, explicitly not urgent.",
    tags: ["routine", "simple-create"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-bulb",
      sender: PRIYA,
      receivedAt: "2026-11-06T19:20:00Z",
      body: "One of the bulbs in the hallway ceiling fitting has gone and the ceiling is too high for me to reach it. The other bulbs work so no rush at all.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "quay-court-101", trade: ["electrical", "general"], urgency: "routine" }],
    },
  },

  // --- Urgent ---------------------------------------------------------------
  {
    id: "urgent-fridge-not-cooling",
    description: "A fridge that stopped cooling needs fixing within days, but isn't a safety risk.",
    tags: ["urgent", "simple-create"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-fridge",
      sender: PRIYA,
      receivedAt: "2026-11-07T08:05:00Z",
      body: "The fridge in my unit stopped getting cold yesterday. Everything inside is warm and I've had to throw food out. Can someone come this week?",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "quay-court-101", trade: "appliance", urgency: "urgent" }],
    },
  },
  {
    id: "urgent-no-hot-water",
    description: "No hot water is urgent: unpleasant and needs fixing within days, but no risk to safety or property.",
    tags: ["urgent", "simple-create"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-hot-water",
      sender: MAYA,
      receivedAt: "2026-11-08T07:10:00Z",
      body: "We've had no hot water since last night, the taps and shower only run cold. Nothing is leaking, it just won't heat up. Could someone look at the water heater please?",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "harbor-view-2a", trade: "plumbing", urgency: "urgent" }],
    },
  },

  // --- Emergency ------------------------------------------------------------
  {
    id: "emergency-burst-pipe",
    description: "Water spraying from a pipe is a same-day risk to property.",
    tags: ["emergency", "simple-create"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-burst-pipe",
      sender: PRIYA,
      receivedAt: "2026-11-09T21:47:00Z",
      body: "HELP the pipe under my bathroom sink just burst, water is spraying everywhere and the floor is flooding. I can't find where to turn the water off!!",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "quay-court-101", trade: "plumbing", urgency: "emergency" }],
    },
  },
  {
    id: "emergency-sparking-outlet",
    description: "A sparking outlet with a burning smell is a safety risk.",
    tags: ["emergency", "simple-create"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-sparking-outlet",
      sender: LUIS,
      receivedAt: "2026-11-10T18:30:00Z",
      body: "The power socket behind my TV sparked when I plugged something in and there's a burning plastic smell and a black scorch mark on the wall. I've switched it off at the breaker for now.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "harbor-view-3b", trade: "electrical", urgency: "emergency" }],
    },
  },
  {
    id: "emergency-front-door-wont-lock",
    description: "A front door that can't be locked overnight is a same-day security risk.",
    tags: ["emergency", "simple-create"],
    board: [],
    propertyRoster,
    message: {
      id: "msg-front-door-lock",
      sender: MAYA,
      receivedAt: "2026-11-11T20:15:00Z",
      body: "My front door lock has snapped inside the door and now it won't lock at all. I can't leave the flat unlocked overnight. Please send someone tonight.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ unitId: "harbor-view-2a", trade: "locksmith", urgency: "emergency" }],
    },
  },
]);
