/**
 * The one browser smoke test, run against the deployed app (see playwright.config.ts).
 *
 * The landing page's Demo button must open the console's Demo workspace, which steps through a recorded run. In the sandbox workspace,
 * a Message sent from the sandbox must flow through to the Review Queue and on to the Board. The live
 * Intake request is intercepted and answered in this process by the live Intake request
 * handler on a scripted mock model, so the test never makes a free-tier model call.
 * The Coordinator's approval goes to the deployed server, which calls no model.
 */
import { expect, test } from "@playwright/test";
import { MockLanguageModelV4 } from "ai/test";
import type { Proposal } from "@/domain";
import { createLiveIntakeHandler } from "@/live";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

/** The Proposal the scripted model submits for the smoke test's Message. */
const PROPOSAL: Proposal = {
  classification: "maintenance",
  uncertain: false,
  draftReplies: [],
  operations: [
    {
      type: "create",
      location: { type: "unit", unitId: "harbor-view-3b" },
      title: "Smoke test: bedroom window won't close",
      description: "The bedroom window in 3B won't close fully and lets in a draught.",
      trade: "carpentry",
      urgency: "routine",
    },
  ],
  reasoning: "A routine window repair in 3B; the Sender isn't in the Property Roster.",
};

/** A model that looks the Sender up, then submits PROPOSAL. A fresh one per run. */
function scriptedModel(email: string): MockLanguageModelV4 {
  const turn = (toolCallId: string, toolName: string, input: unknown) => ({
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  });
  return new MockLanguageModelV4({
    doGenerate: [turn("call-1", "lookUpSender", { email }), turn("call-2", "submitProposal", PROPOSAL)],
  });
}

test("the landing page opens the Demo workspace, which steps through a recorded run", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "An AI agent that turns messy tenant messages into triaged Work Orders." }),
  ).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Open the Demo" }).click();

  await expect(page.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Proposal" })).toBeVisible();

  await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Runs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Burst pipe flooding a bathroom" }).click();

  const run = page.getByRole("region", { name: "Agent run" });
  await expect(run.getByText(/^Step 1 of \d+$/)).toBeVisible();
  await run.getByRole("button", { name: "Next step" }).click();
  await expect(run.getByText(/^Step 2 of \d+$/)).toBeVisible();
  await run.getByRole("button", { name: "Last step" }).click();
  await expect(run.getByRole("heading", { name: /^Routing decision: / })).toBeVisible();
});

test("a sandbox Message flows through the Review Queue to the Board", async ({ page }) => {
  const sender = "new.tenant@example.com";
  const handler = createLiveIntakeHandler({
    limiter: { take: () => Promise.resolve({ allowed: true }) },
    sharedModel: () => ({ model: scriptedModel(sender), name: "scripted mock model (smoke test)" }),
    ownModel: () => {
      throw new Error("The smoke test never uses a visitor's own key.");
    },
  });
  let intakeRequests = 0;
  await page.route("**/api/intake", async (route) => {
    intakeRequests += 1;
    const response = await handler(
      new Request("http://smoke.test/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: route.request().postData() ?? "",
      }),
    );
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });

  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "Incoming Messages", exact: true })).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Console" });

  await rail.getByRole("button", { name: "New Message" }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog.getByLabel("Sender", { exact: true }).selectOption({ label: "Someone not in the Property Roster…" });
  await dialog.getByLabel("Email", { exact: true }).fill(sender);
  await dialog.getByLabel("Message", { exact: true }).fill("Hi, I'm subletting 3B. The bedroom window won't close and it's freezing.");
  await dialog.getByRole("button", { name: "Send and run Intake" }).click();

  await page.getByRole("status").filter({ hasText: "Intake ran" }).getByRole("link", { name: "Open the Review Queue" }).click();
  await expect(page.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
  const queue = page.getByRole("tabpanel");
  await queue.getByRole("button", { name: new RegExp(sender) }).click();
  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation).toContainText("Sender not in the Property Roster");
  await expect(conversation.getByRole("region", { name: "Proposal" })).toContainText("Smoke test: bedroom window won't close");
  expect(intakeRequests).toBe(1);

  await rail.getByRole("link", { name: "Board", exact: true }).click();
  const board = page.getByRole("region", { name: "Board", exact: true });
  await expect(board).toBeVisible();
  await expect(board).not.toContainText("Smoke test: bedroom window won't close");

  await rail.getByRole("link", { name: /^Review Queue/ }).click();
  await queue.getByRole("button", { name: new RegExp(sender) }).click();
  await conversation.getByRole("button", { name: /^Approve & apply/ }).click();
  await expect(queue.getByRole("button", { name: new RegExp(sender) })).toHaveCount(0);

  await rail.getByRole("link", { name: "Board", exact: true }).click();
  await expect(board).toContainText("Smoke test: bedroom window won't close");
});

test.describe("below lg", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the console's navigation opens as a drawer", async ({ page }) => {
    await page.goto("/console/demo/review-queue");
    await expect(page.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();

    await page.getByRole("button", { name: /^Open navigation/ }).click();
    const drawer = page.getByRole("dialog", { name: "Console navigation" });
    await drawer.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Board", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("region", { name: "Board", exact: true })).toBeVisible();
  });
});
