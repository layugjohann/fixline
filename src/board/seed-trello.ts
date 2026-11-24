/**
 * Seeds the Trello Board in TRELLO_BOARD_ID with the open Work Orders the sandbox Board starts with,
 * so a run of `npm run intake` has something to match against (a repeat report, another Tenant's leak).
 *
 *   npm run seed:trello
 *
 * Safe to re-run: a Work Order whose title is already on the Board as an open card is skipped.
 */
import { existsSync } from "node:fs";
import { locationId, type NewWorkOrder } from "@/domain";
import { sandboxBoard } from "@/fixtures";
import { trelloBoardFromEnv } from "./trello";

async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const board = trelloBoardFromEnv();
  const open = new Set(
    (await board.listWorkOrders()).filter((w) => w.status === "open").map((w) => w.title),
  );
  for (const seeded of sandboxBoard) {
    const workOrder: NewWorkOrder = {
      location: seeded.location,
      title: seeded.title,
      description: seeded.description,
      trade: seeded.trade,
      urgency: seeded.urgency,
      messageIds: seeded.messageIds,
      raisedByTenantId: seeded.raisedByTenantId,
    };
    if (open.has(workOrder.title)) {
      console.log(`  skip     ${workOrder.title} (already on the Board)`);
      continue;
    }
    const created = await board.createWorkOrder(workOrder);
    console.log(
      `  created  ${created.id}  ${created.title} [${created.urgency}, ${created.trade}, ${locationId(created.location)}]`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
