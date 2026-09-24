import { expect, test, type Page } from "@playwright/test";

/**
 * The brief's accessibility and responsive requirements, checked against the
 * running application rather than assumed from the markup.
 */

async function signIn(page: Page) {
  await page.goto("/staff/login");
  await page.getByLabel(/Email address/i).fill("staff@demo.test");
  await page.getByLabel(/Password/i).fill("DemoStaff2026!");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Operations overview", exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test(
  "no page overflows horizontally, at 320px (phone), 768px and 1024px (where the table and sidebar share the least room)",
  { tag: "@mobile" },
  async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    const staffRoutes = ["/staff", "/staff/shipments", "/staff/enquiries", "/staff/shipments/new"];
    const publicRoutes = ["/", "/track/TRK-DEMO-001", "/staff/login"];

    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });

      for (const route of staffRoutes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await horizontalOverflow(page), `overflow on ${route} at ${width}px`).toBeLessThanOrEqual(1);
      }

      // Below the table breakpoint the shipments list is cards, not a
      // scrollable table.
      await page.goto("/staff/shipments?q=TRK-DEMO-001");
      if (width < 768) {
        await expect(page.locator("table")).toBeHidden();
      } else {
        await expect(page.locator("table")).toBeVisible();
      }
      await page.getByRole("link", { name: "TRK-DEMO-001" }).click();
      await expect(page.locator("h1")).toContainText("TRK-DEMO-001");
      expect(await horizontalOverflow(page), `overflow on shipment detail at ${width}px`).toBeLessThanOrEqual(1);

      for (const route of publicRoutes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await horizontalOverflow(page), `overflow on ${route} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  },
);

test.describe("keyboard and semantics", () => {
  test("a staff member can sign in using the keyboard alone", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/staff/login");

    await page.getByLabel(/Email address/i).focus();
    await page.keyboard.type("staff@demo.test");
    await page.keyboard.press("Tab");
    await page.keyboard.type("DemoStaff2026!");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Operations overview", exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("keyboard focus is visible on interactive elements", async ({ page }) => {
    await page.goto("/");

    // Tab through the first few focusable elements and check each shows a
    // visible indicator: an outline or the focus ring's box-shadow.
    const results: Array<{ element: string; visible: boolean }> = [];

    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("Tab");

      results.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return { element: "body", visible: false };

          const style = getComputedStyle(el);
          const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
          const ring = style.boxShadow !== "none" && style.boxShadow !== "";

          return {
            element: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
            visible: outline || ring,
          };
        }),
      );
    }

    const invisible = results.filter((result) => !result.visible);
    expect(invisible, `No visible focus on: ${JSON.stringify(invisible)}`).toEqual([]);
  });

  test("focus moves to the result after a tracking lookup", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/Tracking number/i).fill("TRK-DEMO-001");
    await page.getByRole("button", { name: /Track shipment/i }).click();
    await expect(page.getByRole("heading", { name: "TRK-DEMO-001" })).toBeVisible();

    // The result region takes focus, so a screen-reader user learns the outcome.
    const focusedHasResult = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active.textContent?.includes("TRK-DEMO-001"));
    });

    expect(focusedHasResult).toBe(true);
  });
});
