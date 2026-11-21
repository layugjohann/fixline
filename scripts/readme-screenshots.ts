/**
 * Takes the README's screenshots (light mode, 1440×900) of the landing page, the Demo
 * workspace's Review Queue and the Scorecard, and writes them to docs/screenshots/.
 *
 *   npx playwright install chromium                     # once
 *   npm run build && npm start                          # in another terminal
 *   npm run screenshots                                 # against http://localhost:3000
 *   FIXLINE_SCREENSHOT_URL=https://fixline-phi.vercel.app npm run screenshots
 *
 * Where Chromium can't register its Mach ports (some macOS sandboxes), set
 * FIXLINE_SCREENSHOT_SINGLE_PROCESS=1 to launch it as one process.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.FIXLINE_SCREENSHOT_URL ?? "http://localhost:3000";

const SHOTS = [
  { path: "/", file: "landing.png", fullPage: true },
  { path: "/console/demo/review-queue", file: "review-queue.png", fullPage: false },
  { path: "/console/demo/scorecard", file: "scorecard.png", fullPage: false },
];

const singleProcess = process.env.FIXLINE_SCREENSHOT_SINGLE_PROCESS === "1";

await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch(
  singleProcess ? { args: ["--no-sandbox", "--single-process", "--no-zygote"] } : {},
);
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const shot of SHOTS) {
    await page.goto(new URL(shot.path, baseUrl).toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: `docs/screenshots/${shot.file}`, fullPage: shot.fullPage });
    console.log(`docs/screenshots/${shot.file}`);
  }
} finally {
  await browser.close();
}
