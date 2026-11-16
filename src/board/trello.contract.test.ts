/**
 * The Board contract against a real Trello board. Runs only when triggered by hand,
 * against a dedicated test board (never the real one), because it writes to it:
 *
 *   npm run test:trello
 *
 * Needs TRELLO_API_KEY, TRELLO_TOKEN and TRELLO_TEST_BOARD_ID in .env.local or the
 * environment (run scripts/setup.sh trello). Every card a test creates is deleted afterwards.
 */
import { existsSync } from "node:fs";
import { describe, it } from "vitest";
import type { Board } from "./index";
import { describeBoardContract } from "./contract";
import { TrelloBoard, trelloFromEnv } from "./trello";

const enabled = process.env.FIXLINE_TRELLO_CONTRACT === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

if (enabled) {
  describeBoardContract(
    "Trello",
    async () => {
      const { client, options } = trelloFromEnv(process.env, "TRELLO_TEST_BOARD_ID");
      const trello = new TrelloBoard(client, options);
      const created: string[] = [];
      // Track what each test creates so it can be deleted, leaving the test board as it was.
      const board: Board = {
        listWorkOrders: () => trello.listWorkOrders(),
        getWorkOrder: (id) => trello.getWorkOrder(id),
        appendToWorkOrder: (id, update) => trello.appendToWorkOrder(id, update),
        async createWorkOrder(workOrder) {
          const result = await trello.createWorkOrder(workOrder);
          created.push(result.id);
          return result;
        },
      };
      return {
        board,
        // A Coordinator closes a Work Order by archiving its card.
        closeWorkOrder: async (id) => {
          await client.request("PUT", `/cards/${id}`, { body: { closed: true } });
        },
        missingId: "0000000000000000000000ff",
        dispose: async () => {
          await Promise.all(created.splice(0).map((id) => client.request("DELETE", `/cards/${id}`)));
        },
      };
    },
    { timeout: 30_000 },
  );
} else {
  describe("Board contract: Trello", () => {
    it.skip("runs only by hand: npm run test:trello", () => {});
  });
}
