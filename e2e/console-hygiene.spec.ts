import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Pages must load without console errors or React hydration mismatches.
 *
 * A hydration mismatch is invisible in a normal assertion but produces a
 * console error on every load and can leave the server and client markup
 * disagreeing, so it is checked explicitly.
 */

const IGNORABLE = [
  // Next's development overlay and fast-refresh noise.
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
];

function collect(page: Page) {
  const problems: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error" && message.type() !== "warning") return;

    const text = message.text();
    if (IGNORABLE.some((pattern) => pattern.test(text))) return;

    problems.push(`${message.type()}: ${text}`);
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

// One static route and one dynamic, data-driven route: representative of the
// public app's two kinds of page, not every demo tracking number.
const PUBLIC_ROUTES = ["/", "/track/TRK-DEMO-001"];

for (const route of PUBLIC_ROUTES) {
  test(`loads ${route} without console errors`, async ({ page }) => {
    const problems = collect(page);

    await page.goto(route);
    await page.waitForLoadState("networkidle");

    expect(problems, `Console problems on ${route}:\n${problems.join("\n")}`).toEqual([]);
  });
}

test("staff pages load without console errors", async ({ page }) => {
  // Each staff route compiles on first request in development, so this one
  // needs more patience than the public pages.
  test.setTimeout(120_000);

  const problems = collect(page);

  await page.goto("/staff/login");
  await page.getByLabel(/Email address/i).fill("staff@demo.test");
  await page.getByLabel(/Password/i).fill("DemoStaff2026!");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Shipments", exact: true })).toBeVisible({
    timeout: 60_000,
  });

  await page.goto("/staff");
  await page.waitForLoadState("networkidle");

  await page.goto("/staff/shipments?q=TRK-DEMO-001");
  await page.getByRole("link", { name: "TRK-DEMO-001" }).click();
  await expect(page.locator("h1")).toContainText("TRK-DEMO-001");
  await page.waitForLoadState("networkidle");

  await page.goto("/staff/enquiries");
  await page.waitForLoadState("networkidle");

  await page.goto("/staff/shipments/new");
  await page.waitForLoadState("networkidle");

  expect(problems, `Console problems in the staff area:\n${problems.join("\n")}`).toEqual([]);
});
