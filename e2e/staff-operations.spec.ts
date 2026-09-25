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

/**
 * Opens a shipment by searching for it.
 *
 * The list is ordered by most recently updated and paginated, so a specific
 * shipment is not reliably on the first page once other tests have created or
 * edited records. Searching makes the navigation deterministic.
 */
async function openShipment(page: Page, trackingNumber: string) {
  await page.goto(`/staff/shipments?q=${trackingNumber}`);
  await page.getByRole("link", { name: trackingNumber }).click();
  await expect(page.locator("h1")).toContainText(trackingNumber);
}

test.describe("staff operations", () => {
  test("keeps an unauthenticated visitor out of the staff area, and never redirects them beyond it", async ({
    page,
  }) => {
    // A direct, unauthenticated visit: redirected, and nothing protected is
    // served in the response body along the way.
    const response = await page.goto("/staff/shipments");

    await expect(page).toHaveURL(/\/staff\/login/);
    await expect(page.getByRole("heading", { name: /Staff sign in/i })).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("TRK-DEMO-001");
    expect(response?.status()).toBeLessThan(400);

    // The `next` parameter comes from the URL, so the login form only follows
    // it when it points back into /staff; anything else falls back to the
    // overview rather than becoming an open redirect.
    await page.goto("/staff/login?next=https%3A%2F%2Fevil.example.com");
    await page.getByLabel(/Email address/i).fill(STAFF_EMAIL);
    await page.getByLabel(/Password/i).fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: /^Sign in$/i }).click();

    await expect(page).toHaveURL(/\/staff$/);
  });

  test("signs in and lists shipments", { tag: "@mobile" }, async ({ page }) => {
    await signIn(page);
    await page.goto("/staff/shipments");

    // The result count ("22 shipments"), not the navigation item of the same name.
    await expect(page.getByText(/^\d+ shipments?$/).first()).toBeVisible();

    await page.goto("/staff/shipments?q=TRK-DEMO-001");
    await expect(page.getByRole("link", { name: "TRK-DEMO-001" })).toBeVisible();
  });

  test("searches and filters the shipment list", async ({ page }) => {
    await signIn(page);

    await page.goto("/staff/shipments?q=TRK-DEMO");
    await page.getByLabel(/Search by tracking number/i).fill("DEMO-003");
    await page.getByRole("button", { name: /^Search$/i }).click();

    await expect(page.getByRole("link", { name: "TRK-DEMO-003" })).toBeVisible();
    await expect(page.getByRole("link", { name: "TRK-DEMO-001" })).toHaveCount(0);

    // Every number is TRK-DEMO- now, so narrow the search to one page of results.
    await page.goto("/staff/shipments?q=TRK-DEMO-00");
    await expect(page.getByRole("link", { name: "TRK-DEMO-001" })).toBeVisible();

    await page.getByLabel(/^Status/i).selectOption("DELAYED");
    await expect(page.getByRole("link", { name: "TRK-DEMO-003" })).toBeVisible();
    await expect(page.getByRole("link", { name: "TRK-DEMO-002" })).toHaveCount(0);
  });

  test("creates a shipment and it becomes publicly trackable", { tag: "@mobile" }, async ({ page }) => {
    await signIn(page);

    await page.getByRole("link", { name: /New shipment/i }).click();
    await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();

    await page.getByLabel(/Origin city/i).fill("Pelforth");
    await page.getByLabel(/Destination city/i).fill("Redhaven");
    await page.getByLabel(/Estimated delivery/i).fill("2026-12-24");
    await page.getByLabel(/Number of packages/i).fill("2");

    await page.getByRole("button", { name: /Create shipment/i }).click();

    // Lands on the new shipment's detail page with a generated number.
    const heading = page.locator("h1").first();
    await expect(heading).toContainText(/^TRK-/);

    const trackingNumber = (await heading.innerText()).trim();

    await page.goto(`/track/${trackingNumber}`);
    await expect(page.getByRole("heading", { name: trackingNumber })).toBeVisible();
    // Creation opens the timeline the customer sees.
    await expect(page.getByText("Shipment details received. Awaiting collection.").first()).toBeVisible();
  });

  test("adds a tracking event and the customer view reflects it", async ({ page }) => {
    await signIn(page);

    await openShipment(page, "TRK-DEMO-001");

    const message = `Passed through the sorting centre at ${Date.now()}.`;

    await page.getByLabel(/^Location/i).fill("Thornbeck sorting centre");
    await page.getByLabel(/Message to the customer/i).fill(message);
    await page.getByRole("button", { name: /Add event/i }).click();

    await expect(page.getByText(/Event added/i)).toBeVisible();

    await page.goto("/track/TRK-DEMO-001");
    await expect(page.getByText(message).first()).toBeVisible();
    await expect(page.getByText("Latest update").first()).toBeVisible();
  });

  test("adds an internal note that never reaches the customer page", async ({
    page,
  }) => {
    await signIn(page);
    await openShipment(page, "TRK-DEMO-002");

    const secret = `Internal handling note ${Date.now()}`;

    await page.getByLabel(/Add a note/i).fill(secret);
    await page.getByRole("button", { name: /Save note/i }).click();

    await expect(page.getByText(/Internal note added/i)).toBeVisible();
    await expect(page.getByText(secret)).toBeVisible();

    await page.goto("/track/TRK-DEMO-002");
    const customerView = await page.locator("body").innerText();
    expect(customerView).not.toContain(secret);
  });

  test("signs out cleanly", async ({ page }) => {
    await signIn(page);

    await page.goto("/staff/shipments?q=TRK-DEMO");
    await expect(page.getByRole("link", { name: "TRK-DEMO-001" })).toBeVisible();

    await page.getByRole("button", { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/staff\/login/);

    // Back must not restore a protected page from memory.
    await page.goBack();
    await expect(page).toHaveURL(/\/staff\/login/);
    await expect(page.getByRole("link", { name: "TRK-DEMO-001" })).toHaveCount(0);

    await page.goto("/staff/shipments");
    await expect(page).toHaveURL(/\/staff\/login/);
  });
});

test.describe("untrusted customer input", () => {
  test("markup in an enquiry is shown as text to staff, never executed", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    let dialogFired = false;
    page.on("dialog", async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    const marker = `xss-${Date.now()}`;
    const payload = `<img src=x onerror="alert('${marker}')"> <script>alert('${marker}')</script> ${marker}`;

    await page.goto("/track/TRK-DEMO-001");
    await page.getByLabel(/Your message/i).fill(payload);
    await page.getByRole("button", { name: /Send enquiry/i }).click();
    await expect(
      page.getByRole("heading", { name: /We have received your enquiry/i }),
    ).toBeVisible();

    await signIn(page);
    await page.goto("/staff/enquiries");

    // The literal characters are visible, which means they were escaped.
    await expect(page.getByText(`<script>alert('${marker}')</script>`, { exact: false })).toBeVisible();
    expect(await page.locator(`img[src="x"]`).count()).toBe(0);
    expect(dialogFired).toBe(false);
  });
});

test.describe("customer enquiry reaches staff", () => {
  test("a submitted enquiry appears in the staff queue", { tag: "@mobile" }, async ({ page }) => {
    const message = `Please confirm the delivery window. Reference ${Date.now()}.`;

    await page.goto("/track/TRK-DEMO-001");
    await page.getByLabel(/Your message/i).fill(message);
    await page.getByRole("button", { name: /Send enquiry/i }).click();

    await expect(
      page.getByRole("heading", { name: /We have received your enquiry/i }),
    ).toBeVisible();

    await signIn(page);
    await page
      .getByRole("navigation", { name: "Staff sections" })
      .getByRole("link", { name: /Enquiries/i })
      .click();

    await expect(page.getByText(message)).toBeVisible();

    // And it can be worked through to resolution.
    const card = page.locator("article", { hasText: message });
    await card.getByRole("button", { name: /Mark resolved/i }).click();

    await expect(page.getByText(/marked resolved/i)).toBeVisible();
  });
});
