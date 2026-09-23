import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * End-to-end tests run against a real running application.
 *
 * Prerequisites, documented in the README:
 *   1. npm run db:local   (in its own terminal)
 *   2. npm run db:migrate && npm run db:seed
 *
 * The suite then starts the application itself unless one is already running.
 */
export default defineConfig({
  testDir: "./e2e",
  // Compiles every route once before the suite, so no single test absorbs the
  // development server's cold-start cost.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // Development mode compiles a route on first request, so the first visit to
  // each page is slow. This is generous enough to absorb that without masking
  // a genuine hang.
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // A small, representative subset, not the whole desktop suite re-run at
    // a second viewport: tests worth a second, real-device check are tagged
    // @mobile at the point where they are defined.
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 5"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
