/**
 * The Board contract: one test suite that defines how every Board behaves.
 * The fake Board runs it on every CI run; the Trello adapter runs it by hand
 * against a dedicated test Board (`npm run test:trello`).
 *
 * The suite only creates the Work Orders it needs and never assumes the Board
 * starts empty, so it can run against a real Board that has other Work Orders on it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewWorkOrder } from "@/domain";
import { WorkOrderNotFoundError, type Board } from "./index";

export interface BoardContractHarness {
  board: Board;
  /** Close a Work Order the way a Coordinator would on the Board. The Board interface itself can't. */
  closeWorkOrder(id: string): Promise<void>;
  /** An id in this Board's own format that names no Work Order. */
  missingId: string;
  /** Remove whatever the test put on the Board. */
  dispose?(): Promise<void>;
}

export interface BoardContractOptions {
  /** Per-test timeout in milliseconds, for Boards behind a network. */
  timeout?: number;
}

const leakingTap: NewWorkOrder = {
  location: { type: "unit", unitId: "harbor-view-2a" },
  title: "Kitchen tap dripping",
  description: "The kitchen sink tap drips constantly and leaves a puddle under the cabinet.",
  trade: "plumbing",
  urgency: "routine",
  messageIds: ["msg-contract-1"],
  raisedByTenantId: "tenant-maya",
};

const lobbyLight: NewWorkOrder = {
  location: { type: "common-area", commonAreaId: "harbor-view-lobby" },
  title: "Lobby light out",
  description: "The main ceiling light in the lobby is out, so the entrance is dark at night.",
  trade: "electrical",
  urgency: "urgent",
  messageIds: ["msg-contract-2", "msg-contract-3"],
};

const burstPipe: NewWorkOrder = {
  location: { type: "unit", unitId: "harbor-view-3b" },
  title: "Burst pipe under bathroom sink",
  description: "Water is pouring from the pipe under the bathroom sink.",
  trade: "plumbing",
  urgency: "emergency",
  messageIds: ["msg-contract-4"],
};

export function describeBoardContract(
  name: string,
  setup: () => Promise<BoardContractHarness>,
  options: BoardContractOptions = {},
): void {
  describe(`Board contract: ${name}`, { timeout: options.timeout }, () => {
    let harness: BoardContractHarness | undefined;
    let board: Board;

    beforeEach(async () => {
      harness = await setup();
      board = harness.board;
    }, options.timeout);

    afterEach(async () => {
      await harness?.dispose?.();
      harness = undefined;
    }, options.timeout);

    describe("creating a Work Order", () => {
      it("returns it open, with a new id and every field as given", async () => {
        const created = await board.createWorkOrder(leakingTap);

        expect(created).toEqual({ ...leakingTap, id: expect.any(String), status: "open" });
        expect(created.id).not.toBe("");
      });

      it("keeps the Tenant who raised it", async () => {
        const created = await board.createWorkOrder(leakingTap);

        expect((await board.getWorkOrder(created.id))?.raisedByTenantId).toBe("tenant-maya");
      });

      it("keeps a Work Order raised by an unknown Sender without a Tenant", async () => {
        const created = await board.createWorkOrder(lobbyLight);

        expect(await board.getWorkOrder(created.id)).not.toHaveProperty("raisedByTenantId");
      });

      it("keeps a Common Area as the location", async () => {
        const created = await board.createWorkOrder(lobbyLight);

        expect(await board.getWorkOrder(created.id)).toEqual({ ...lobbyLight, id: created.id, status: "open" });
      });

      it("keeps every Urgency and Trade", async () => {
        const created = await board.createWorkOrder(burstPipe);

        expect(await board.getWorkOrder(created.id)).toMatchObject({ urgency: "emergency", trade: "plumbing" });
      });

      it("gives each Work Order its own id", async () => {
        const first = await board.createWorkOrder(leakingTap);
        const second = await board.createWorkOrder(leakingTap);

        expect(first.id).not.toBe(second.id);
      });
    });

    describe("reading Work Orders", () => {
      it("gets a Work Order by id, exactly as created", async () => {
        const created = await board.createWorkOrder(leakingTap);

        expect(await board.getWorkOrder(created.id)).toEqual(created);
      });

      it("lists every Work Order created", async () => {
        const tap = await board.createWorkOrder(leakingTap);
        const light = await board.createWorkOrder(lobbyLight);

        const listed = await board.listWorkOrders();

        expect(listed).toContainEqual(tap);
        expect(listed).toContainEqual(light);
      });

      it("finds nothing for an id that isn't on the Board", async () => {
        expect(await board.getWorkOrder(harness!.missingId)).toBeUndefined();
      });

      it("finds nothing for an id that isn't in the Board's format", async () => {
        expect(await board.getWorkOrder("WO-does-not-exist")).toBeUndefined();
      });

      it("reports a Work Order a Coordinator closed as closed, and never lists it as open", async () => {
        const created = await board.createWorkOrder(leakingTap);

        await harness!.closeWorkOrder(created.id);

        expect(await board.getWorkOrder(created.id)).toMatchObject({ id: created.id, status: "closed" });
        const listed = (await board.listWorkOrders()).find((workOrder) => workOrder.id === created.id);
        expect(listed?.status ?? "closed").toBe("closed");
      });

      it("hands out copies, so changing one doesn't change the Board", async () => {
        const created = await board.createWorkOrder(leakingTap);
        const copy = await board.getWorkOrder(created.id);

        copy!.title = "Changed by the caller";
        copy!.messageIds.push("msg-not-on-the-board");

        expect(await board.getWorkOrder(created.id)).toEqual(created);
      });
    });

    describe("appending to a Work Order", () => {
      it("adds the information to the description and links the Message", async () => {
        const created = await board.createWorkOrder(leakingTap);

        const updated = await board.appendToWorkOrder(created.id, {
          information: "The puddle now reaches the hallway.",
          messageId: "msg-contract-5",
        });

        expect(updated.description).toContain(leakingTap.description);
        expect(updated.description).toContain("The puddle now reaches the hallway.");
        expect(updated.messageIds).toEqual(["msg-contract-1", "msg-contract-5"]);
        expect(await board.getWorkOrder(created.id)).toEqual(updated);
      });

      it("leaves every other field as it was", async () => {
        const created = await board.createWorkOrder(lobbyLight);

        const updated = await board.appendToWorkOrder(created.id, {
          information: "Still out tonight.",
          messageId: "msg-contract-6",
        });

        expect(updated).toMatchObject({
          id: created.id,
          location: lobbyLight.location,
          title: lobbyLight.title,
          trade: lobbyLight.trade,
          urgency: lobbyLight.urgency,
          status: "open",
        });
      });

      it("keeps every update, in order", async () => {
        const created = await board.createWorkOrder(leakingTap);

        await board.appendToWorkOrder(created.id, { information: "First update.", messageId: "msg-contract-7" });
        const updated = await board.appendToWorkOrder(created.id, {
          information: "Second update.",
          messageId: "msg-contract-8",
        });

        const first = updated.description.indexOf("First update.");
        expect(first).toBeGreaterThan(-1);
        expect(updated.description.indexOf("Second update.")).toBeGreaterThan(first);
        expect(updated.messageIds).toEqual(["msg-contract-1", "msg-contract-7", "msg-contract-8"]);
      });

      it("links a Message only once, however many times it's appended", async () => {
        const created = await board.createWorkOrder(leakingTap);

        await board.appendToWorkOrder(created.id, { information: "More detail.", messageId: "msg-contract-1" });

        expect((await board.getWorkOrder(created.id))?.messageIds).toEqual(["msg-contract-1"]);
      });

      it("only links the Message when there is no new information", async () => {
        const created = await board.createWorkOrder(leakingTap);

        const updated = await board.appendToWorkOrder(created.id, { information: "  ", messageId: "msg-contract-9" });

        expect(updated.description).toBe(leakingTap.description);
        expect(updated.messageIds).toEqual(["msg-contract-1", "msg-contract-9"]);
      });

      it("rejects a Work Order that isn't on the Board", async () => {
        await expect(
          board.appendToWorkOrder(harness!.missingId, { information: "Anything.", messageId: "msg-contract-10" }),
        ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
        await expect(
          board.appendToWorkOrder("WO-does-not-exist", { information: "Anything.", messageId: "msg-contract-10" }),
        ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
      });
    });
  });
}
