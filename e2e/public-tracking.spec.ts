import { expect, test } from "@playwright/test";

/**
 * The customer journeys the brief asks to see demonstrated, run against the
 * seeded demo data on a real browser.
 */
test.describe("public tracking", () => {
  test("tracks a shipment that is in transit", { tag: "@mobile" }, async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/Tracking number/i).fill("TRK-DEMO-001");
    await page.getByRole("button", { name: /Track shipment/i }).click();

    await expect(
      page.getByRole("heading", { name: "TRK-DEMO-001" }),
    ).toBeVisible();
    await expect(page.getByText("In transit").first()).toBeVisible();
    await expect(page.getByText("Latest update").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tracking history" }),
    ).toBeVisible();

    // The result becomes a shareable URL without a full page load.
    await expect(page).toHaveURL(/\/track\/TRK-DEMO-001$/);
  });

  test(
    "handles an unknown tracking number as a product state",
    { tag: "@mobile" },
    async ({ page }) => {
      await page.goto("/");

      await page.getByLabel(/Tracking number/i).fill("TRK-NOPE-999");
      await page.getByRole("button", { name: /Track shipment/i }).click();

      await expect(page.getByText(/could not find TRK-NOPE-999/i)).toBeVisible();
      await expect(page.getByText(/404/)).toHaveCount(0);
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    },
  );

  test("answers a link to an unknown number with 404 and the same not-found state", async ({
    page,
  }) => {
    const response = await page.goto("/track/TRK-NOPE-999");

    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not find TRK-NOPE-999/i)).toBeVisible();
    await expect(page.getByLabel(/Tracking number/i)).toBeVisible();
  });

  test("shows a delayed shipment with both estimates and an explanation", async ({
    page,
  }) => {
    await page.goto("/track/TRK-DEMO-003");

    await expect(page.getByText("This shipment is delayed")).toBeVisible();
    await expect(page.getByText(/Updated from/i)).toBeVisible();
    await expect(page.getByText(/Severe weather/i).first()).toBeVisible();
  });

  test("shows an exception shipment with a clear warning and reason", async ({
    page,
  }) => {
    await page.goto("/track/TRK-DEMO-004");

    await expect(page.getByText("This shipment needs attention")).toBeVisible();
    await expect(page.getByText(/address is incomplete/i).first()).toBeVisible();
  });

  test("completes the search by keyboard alone", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/Tracking number/i).focus();
    await page.keyboard.type("TRK-DEMO-001");
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: "TRK-DEMO-001" }),
    ).toBeVisible();
  });
});
