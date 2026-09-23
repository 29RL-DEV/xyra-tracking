import { beforeEach, describe, expect, it } from "vitest";
import { GET as publicTrack } from "@/app/api/shipments/[trackingNumber]/route";
import { POST as submitEnquiry } from "@/app/api/enquiries/route";
import { GET as staffShipments } from "@/app/api/staff/shipments/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { get, params, send } from "../helpers/request";
import {
  resetDatabase,
  seedFixtures,
  signIn,
  signOut,
  TEST_STAFF,
  type Fixtures,
} from "../helpers/fixtures";

/**
 * No API response may be cached.
 *
 * A staff change has to reach the customer on their next request, and an
 * authenticated response must never be stored by a shared cache. Without an
 * explicit header an intermediary may apply heuristic freshness, so every
 * response carries one.
 */
function expectNoStore(response: Response, label: string) {
  const header = response.headers.get("cache-control") ?? "";

  expect(header, `${label} is missing a no-store cache header`).toMatch(/no-store/i);
  expect(header, `${label} is missing a private cache header`).toMatch(/private/i);
}

describe("API response caching", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    resetRateLimits();
    signOut();
  });

  it("marks every kind of response no-store, private — success, not-found, receipt, rejection and session", async () => {
    const found = await publicTrack(
      get("/api/shipments/TRK-TEST-001"),
      params({ trackingNumber: "TRK-TEST-001" }),
    );
    expect(found.status).toBe(200);
    expectNoStore(found, "public tracking");

    const notFound = await publicTrack(
      get("/api/shipments/TRK-NOPE-999"),
      params({ trackingNumber: "TRK-NOPE-999" }),
    );
    expect(notFound.status).toBe(404);
    expectNoStore(notFound, "not-found");

    const receipt = await submitEnquiry(
      send("/api/enquiries", "POST", {
        trackingNumber: "TRK-TEST-001",
        category: "OTHER",
        message: "A message long enough to pass validation checks.",
      }),
    );
    expect(receipt.status).toBe(201);
    expectNoStore(receipt, "enquiry receipt");

    const rejected = await staffShipments(get("/api/staff/shipments"));
    expect(rejected.status).toBe(401);
    expectNoStore(rejected, "401 rejection");

    const loginResponse = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );
    expectNoStore(loginResponse, "login");

    await signIn(fixtures.staffId);
    const staffData = await staffShipments(get("/api/staff/shipments"));
    expect(staffData.status).toBe(200);
    expectNoStore(staffData, "staff shipment list");

    expectNoStore(await me(get("/api/auth/me")), "session read");
    expectNoStore(await logout(send("/api/auth/logout", "POST")), "logout");
  });
});
