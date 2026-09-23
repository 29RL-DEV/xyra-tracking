import { expect, test } from "@playwright/test";

/**
 * Security headers are set in next.config.ts, which means they are applied by
 * the server rather than by a route handler — so only a real HTTP response can
 * prove they are there. The console-hygiene suite covers the other half of the
 * question: whether the policy breaks the application.
 */

const REQUIRED = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

// The policy is applied globally in next.config.ts, so one page route and one
// API route are enough to prove it — not every route that carries it.
for (const route of ["/", "/api/shipments/TRK-DEMO-001"]) {
  test(`serves security headers on ${route}`, async ({ request }) => {
    const response = await request.get(route);
    const headers = response.headers();

    for (const [name, value] of Object.entries(REQUIRED)) {
      expect(headers[name], `${name} on ${route}`).toBe(value);
    }

    const csp = headers["content-security-policy"];
    expect(csp, `content-security-policy on ${route}`).toBeTruthy();

    // The directives that carry the weight of this policy.
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");

    expect(headers["permissions-policy"]).toContain("camera=()");
  });
}

test("does not advertise the framework in responses", async ({ request }) => {
  const response = await request.get("/");

  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("the staff area is not framable and is still reachable", async ({ request }) => {
  const response = await request.get("/staff/login");

  expect(response.status()).toBe(200);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});
