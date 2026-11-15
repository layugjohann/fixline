/**
 * The golden dataset: written before tuning the agent to pass it, so it defines
 * quality up front. Synthetic data only (ADR 0002).
 */
import type { WorkOrder, WorkOrderLocation } from "@/domain";
import { propertyRoster } from "@/fixtures";
import { parseScenarios } from "./scenario";

const MAYA = { email: "maya.okafor@example.com", name: "Maya Okafor" }; // Harbor View 2A
const LUIS = { email: "luis.romero@example.com", name: "Luis Romero" }; // Harbor View 3B
const PRIYA = { email: "priya.nair@example.com", name: "Priya Nair" }; // Quay Court 101

const unit = (unitId: string): WorkOrderLocation => ({ type: "unit", unitId });
const commonArea = (commonAreaId: string): WorkOrderLocation => ({ type: "common-area", commonAreaId });

/** An unrelated open Work Order, so scenarios don't all start from an empty Board. */
const existingWorkOrders: WorkOrder[] = [
  {
    id: "WO-1",
    location: unit("quay-court-102"),
    title: "Broken window latch",
    description: "Bedroom window latch won't close.",
    trade: "carpentry",
    urgency: "routine",
    status: "open",
    messageIds: ["msg-seed-1"],
  },
];

/** Maya's dripping kitchen tap, already on the Board. */
const mayaKitchenTap: WorkOrder = {
  id: "WO-2",
  location: unit("harbor-view-2a"),
  title: "Dripping kitchen sink tap",
  description: "Kitchen sink tap drips constantly; small puddle under the cabinet each morning.",
  trade: "plumbing",
  urgency: "urgent",
  status: "open",
  messageIds: ["msg-seed-2"],
};

/** Luis's broken heating, reported last week and still open. */
const luisHeating: WorkOrder = {
  id: "WO-3",
  location: unit("harbor-view-3b"),
  title: "Radiators not heating",
  description: "None of the radiators in the flat get warm; the boiler display shows no error.",
  trade: "hvac",
  urgency: "urgent",
  status: "open",
  messageIds: ["msg-seed-3"],
};

/** Priya's fridge, repaired and closed last month. */
const priyaFridgeClosed: WorkOrder = {
  id: "WO-4",
  location: unit("quay-court-101"),
  title: "Fridge not cooling",
  description: "Fridge stopped getting cold; thermostat replaced.",
  trade: "appliance",
  urgency: "urgent",
  status: "closed",
  messageIds: ["msg-seed-4"],
};

/** A leaking washing machine in Harbor View's laundry room, reported by Luis (3B). */
const laundryMachineLeak: WorkOrder = {
  id: "WO-5",
  location: commonArea("harbor-view-laundry-room"),
  title: "Washing machine leaking in laundry room",
  description: "The washing machine nearest the door leaks water across the laundry room floor during the spin cycle.",
  trade: "appliance",
  urgency: "urgent",
  status: "open",
  messageIds: ["msg-seed-5"],
};

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
      workOrders: [{ location: unit("harbor-view-3b"), trade: "carpentry", urgency: "routine" }],
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
      workOrders: [{ location: unit("quay-court-101"), trade: ["electrical", "general"], urgency: "routine" }],
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
      workOrders: [{ location: unit("quay-court-101"), trade: "appliance", urgency: "urgent" }],
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
      workOrders: [{ location: unit("harbor-view-2a"), trade: "plumbing", urgency: "urgent" }],
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
      workOrders: [{ location: unit("quay-court-101"), trade: "plumbing", urgency: "emergency" }],
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
      workOrders: [{ location: unit("harbor-view-3b"), trade: "electrical", urgency: "emergency" }],
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
      workOrders: [{ location: unit("harbor-view-2a"), trade: "locksmith", urgency: "emergency" }],
    },
  },

  // --- Matching existing Work Orders ---------------------------------------
  {
    id: "match-duplicate-report-same-tenant",
    description: "The same Tenant reports a problem already on the Board, so the Message attaches to it.",
    tags: ["match", "duplicate"],
    board: [...existingWorkOrders, mayaKitchenTap],
    propertyRoster,
    message: {
      id: "msg-tap-duplicate",
      sender: MAYA,
      receivedAt: "2026-11-12T08:40:00Z",
      body: "Hi, not sure if my last email got through, so writing again: the tap over my kitchen sink won't stop dripping. It's getting worse and I'm emptying a bowl under it twice a day now.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ type: "attach", workOrderId: "WO-2" }],
    },
  },
  {
    id: "match-angry-follow-up",
    description: "An angry 'still broken' chaser is an update to the open Work Order, not a new one.",
    tags: ["match", "follow-up"],
    board: [...existingWorkOrders, luisHeating],
    propertyRoster,
    message: {
      id: "msg-heating-chaser",
      sender: LUIS,
      receivedAt: "2026-11-13T07:55:00Z",
      body: "STILL NO HEATING!!! I reported this a WEEK ago and nobody has come. It was 12 degrees in my living room this morning. This is ridiculous, when is someone actually going to fix it??",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ type: "attach", workOrderId: "WO-3" }],
    },
  },
  {
    id: "match-follow-up-with-new-detail",
    description: "A calm follow-up adding a detail to an open Work Order attaches to it.",
    tags: ["match", "follow-up"],
    board: [mayaKitchenTap, luisHeating],
    propertyRoster,
    message: {
      id: "msg-tap-access",
      sender: MAYA,
      receivedAt: "2026-11-13T12:10:00Z",
      body: "About the dripping kitchen tap: I'll be working from home all of Thursday if that's easier for the plumber to get in. Also the drip seems to come from the base of the tap, not the spout.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ type: "attach", workOrderId: "WO-2" }],
    },
  },
  {
    id: "no-match-different-fixture-same-unit",
    description: "A different plumbing problem in the same Unit is a new Work Order, not the open tap one.",
    tags: ["match", "similar-but-different"],
    board: [...existingWorkOrders, mayaKitchenTap],
    propertyRoster,
    message: {
      id: "msg-shower-drain",
      sender: MAYA,
      receivedAt: "2026-11-14T19:30:00Z",
      body: "The shower in the bathroom is draining really slowly, I end up standing in a few inches of water by the end. No leaks anywhere, it just takes ages to go down. Not urgent, whenever someone is free.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ location: unit("harbor-view-2a"), trade: "plumbing", urgency: "routine" }],
    },
  },
  {
    id: "no-match-same-problem-different-unit",
    description: "The same kind of problem in another Tenant's Unit is a new Work Order for that Unit.",
    tags: ["match", "similar-but-different"],
    board: [...existingWorkOrders, mayaKitchenTap],
    propertyRoster,
    message: {
      id: "msg-luis-tap",
      sender: LUIS,
      receivedAt: "2026-11-14T09:05:00Z",
      body: "My kitchen sink tap has started dripping non-stop and there's a bit of water collecting in the cupboard underneath. Could someone come and have a look this week?",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ location: unit("harbor-view-3b"), trade: "plumbing", urgency: "urgent" }],
    },
  },
  {
    id: "no-match-closed-work-order-recurs",
    description: "A problem that comes back after its Work Order was closed needs a new Work Order.",
    tags: ["match", "similar-but-different"],
    board: [...existingWorkOrders, priyaFridgeClosed],
    propertyRoster,
    message: {
      id: "msg-fridge-again",
      sender: PRIYA,
      receivedAt: "2026-11-15T08:20:00Z",
      body: "The fridge you fixed last month has stopped getting cold again. Milk went off overnight. Can someone come back out this week?",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ location: unit("quay-court-101"), trade: "appliance", urgency: "urgent" }],
    },
  },

  // --- Multi-problem Messages -----------------------------------------------
  {
    id: "multi-problem-attach-and-create",
    description: "One Message about the open heating Work Order and a new dripping tap: one attach plus one create.",
    tags: ["multi-problem", "match"],
    board: [...existingWorkOrders, luisHeating],
    propertyRoster,
    message: {
      id: "msg-heater-and-tap",
      sender: LUIS,
      receivedAt: "2026-11-15T18:40:00Z",
      body: "The heater is dead AGAIN, the radiators are stone cold just like last week. Also, unrelated, the kitchen tap has started dripping a little. That one's not a big deal, whenever someone's around.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [
        { type: "attach", workOrderId: "WO-3" },
        { location: unit("harbor-view-3b"), trade: "plumbing", urgency: "routine" },
      ],
    },
  },
  {
    id: "multi-problem-three-problems",
    description:
      "Three separate problems in one Message, two in the Tenant's Unit and one in a Common Area: three new Work Orders.",
    tags: ["multi-problem", "common-area"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-three-problems",
      sender: PRIYA,
      receivedAt: "2026-11-16T09:30:00Z",
      body:
        "Hi, a few things while I think of it:\n" +
        "1) the oven won't heat up at all since Sunday, so I can't cook anything, could someone come this week?\n" +
        "2) the bathroom extractor fan has stopped working, no rush on that one.\n" +
        "3) not my flat, but the light in the building's bike store downstairs is out. Not urgent.\n" +
        "Thanks, Priya (101)",
    },
    expected: {
      classification: "maintenance",
      workOrders: [
        { location: unit("quay-court-101"), trade: "appliance", urgency: "urgent" },
        { location: unit("quay-court-101"), trade: ["electrical", "hvac"], urgency: "routine" },
        { location: commonArea("quay-court-bike-store"), trade: ["electrical", "general"], urgency: "routine" },
      ],
    },
  },

  // --- Common Areas -----------------------------------------------------------
  {
    id: "common-area-new-report",
    description: "A problem in a shared stairwell is recorded against the Common Area, not the Sender's Unit.",
    tags: ["common-area"],
    board: existingWorkOrders,
    propertyRoster,
    message: {
      id: "msg-stairwell-light",
      sender: MAYA,
      receivedAt: "2026-11-16T07:45:00Z",
      body: "Just a heads up, one of the lights in the stairwell between the 2nd and 3rd floor keeps flickering. It still works, so no rush.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ location: commonArea("harbor-view-stairwell"), trade: ["electrical", "general"], urgency: "routine" }],
    },
  },
  {
    id: "common-area-merge-across-units",
    description:
      "A Tenant in 2A reports the laundry room leak already raised from 3B: it attaches to the Common Area Work Order.",
    tags: ["common-area", "match", "duplicate"],
    board: [...existingWorkOrders, mayaKitchenTap, laundryMachineLeak],
    propertyRoster,
    message: {
      id: "msg-laundry-leak",
      sender: MAYA,
      receivedAt: "2026-11-16T11:20:00Z",
      body: "The washing machine by the door in the laundry room is leaking all over the floor again when it spins. I nearly slipped. Someone should look at it.",
    },
    expected: {
      classification: "maintenance",
      workOrders: [{ type: "attach", workOrderId: "WO-5" }],
    },
  },
]);
