import { request } from "@playwright/test";

/**
 * Warms the routes before the suite runs.
 *
 * The end-to-end tests run against the development server, which compiles each
 * route on its first request. Without this, whichever test happens to touch a
 * route first absorbs several seconds of compilation and can time out on a cold
 * start — a property of the test environment, not of the application.
 */
const ROUTES = [
  "/",
  "/track/TRK-DEMO-001",
  "/staff/login",
  "/staff",
  "/api/shipments/TRK-DEMO-001",
  "/api/auth/login",
  "/api/staff/shipments",
  "/staff/shipments",
  "/staff/enquiries",
  "/staff/shipments/new",
];

export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const context = await request.newContext({ baseURL });

  for (const route of ROUTES) {
    try {
      // Status is irrelevant: a 401 or 405 still compiles the route.
      await context.get(route, { timeout: 120_000, failOnStatusCode: false });
    } catch {
      // The suite's own assertions report a genuinely unreachable server.
    }
  }

  await context.dispose();
}
