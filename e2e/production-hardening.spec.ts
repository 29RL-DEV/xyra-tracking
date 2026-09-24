import { expect, test, type Page } from "@playwright/test";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "staff@demo.test";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "DemoStaff2026!";

async function signIn(page: Page) {
  await page.goto("/staff/login");
  await page.getByLabel(/Email address/i).fill(STAFF_EMAIL);
  await page.getByLabel(/Password/i).fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Operations overview", exact: true })).toBeVisible();
}

test.describe("operational basics", () => {
  test("crawlers are kept out of the staff area and the API", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();

    expect(robots).toContain("Disallow: /staff");
    expect(robots).toContain("Disallow: /api/");
  });

  test("tracking and staff pages ask not to be indexed, and every page has an icon", async ({
    page,
  }) => {
    for (const path of ["/track/TRK-DEMO-001", "/staff/login"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
    }

    const icon = await page.request.get(
      (await page.locator('link[rel="icon"]').getAttribute("href"))!,
    );
    expect(icon.status()).toBe(200);
  });
});

test.describe("enquiry in shipment context", () => {
  test("staff see an enquiry and its reference on the shipment, and can delete it", async ({
    page,
  }) => {
    const message = `Please leave it with reception. Check ${Date.now()}.`;

    await page.goto("/track/TRK-DEMO-005");
    await page.getByLabel(/Your message/i).fill(message);
    await page.getByRole("button", { name: /Send enquiry/i }).click();
    await expect(page.getByRole("heading", { name: /We have received your enquiry/i })).toBeVisible();

    const reference = (
      await page.getByText("Your reference").locator("xpath=following-sibling::dd").innerText()
    ).trim();
    expect(reference).toMatch(/^[A-Z0-9]{8}$/);

    await signIn(page);

    // The customer's reference leads to the shipment.
    await page.goto("/staff/shipments?q=TRK-DEMO-005");
    await page.getByRole("link", { name: "TRK-DEMO-005" }).click();
    const onShipment = page.getByRole("region", { name: "Enquiries about this shipment" });
    await expect(onShipment.getByText(message)).toBeVisible();
    await expect(onShipment.getByText(`Ref ${reference}`)).toBeVisible();

    // Deletion takes a second, deliberate click.
    await page.goto("/staff/enquiries");
    const row = page.locator("article", { hasText: message });
    await expect(row.getByText(`Ref ${reference}`)).toBeVisible();

    await row.getByRole("button", { name: /^Delete — enquiry for/ }).click();
    await row.getByRole("button", { name: `Delete enquiry ${reference}` }).click();

    await expect(page.getByText(`Enquiry ${reference} deleted`)).toBeVisible();
    await expect(page.locator("article", { hasText: message })).toHaveCount(0);
  });
});
