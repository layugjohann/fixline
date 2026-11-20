import { defineConfig, devices } from "@playwright/test";

/**
 * The browser smoke test (e2e/), run against the deployed app:
 *
 *   npm run test:smoke                                    # https://fixline-phi.vercel.app
 *   FIXLINE_SMOKE_URL=http://localhost:3000 npm run test:smoke
 *
 * It makes no free-tier model call: live mode's Intake request is answered in the
 * test by a scripted mock model, so it never reaches the deployed server.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.FIXLINE_SMOKE_URL ?? "https://fixline-phi.vercel.app",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
