import { describe, expect, it } from "vitest";
import { loadReplays } from "@/replays/files";
import { landingExample, pickLandingReplay } from "./landing";

describe("landing page example", () => {
  it("plays the recorded heater-and-tap replay as Message, lookups, Work Orders and routing", async () => {
    const replay = pickLandingReplay(await loadReplays());
    expect(replay?.title).toBe("Heater dead again, plus a dripping tap");
    const example = landingExample(replay!);

    expect(example.sender).toBe("Luis Romero");
    expect(example.body).toContain("The heater is dead AGAIN");
    expect(example.lookups.map((lookup) => lookup.label)).toContain("Look up Sender");
    expect(example.lookups.some((lookup) => lookup.detail.includes("luis.romero@example.com"))).toBe(true);
    expect(example.workOrders).toEqual([
      expect.objectContaining({ kind: "attach", workOrderId: "WO-3", title: "Radiators not heating" }),
      expect.objectContaining({ kind: "create", title: "Kitchen tap dripping", urgency: "routine", trade: "plumbing" }),
    ]);
    expect(example.routing?.outcome).toBe("auto-apply");
  });

  it("falls back to another replay when the hero's is missing", async () => {
    const replays = (await loadReplays()).filter((replay) => replay.id !== "multi-problem-attach-and-create");
    expect(pickLandingReplay(replays)).toBeDefined();
    expect(pickLandingReplay([])).toBeUndefined();
  });
});
