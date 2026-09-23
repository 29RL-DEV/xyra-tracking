import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { countOpenEnquiries } from "@/lib/services/enquiry-service";
import { getOperationsOverview } from "@/lib/services/shipment-service";
import { NOTE_CANARY, resetDatabase, seedFixtures } from "../helpers/fixtures";

/**
 * The staff overview is built only from counts the database holds, so every
 * figure it shows can be checked against the fixture directly.
 */
describe("operations overview", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
  });

  it("counts every status, including those with no shipments", async () => {
    const overview = await getOperationsOverview();

    expect(overview.total).toBe(5);
    expect(overview.countsByStatus).toEqual({
      CREATED: 1,
      COLLECTED: 0,
      IN_TRANSIT: 1,
      OUT_FOR_DELIVERY: 0,
      DELIVERED: 1,
      DELAYED: 1,
      EXCEPTION: 1,
    });
  });

  it("lists only delayed and held shipments as needing attention", async () => {
    const overview = await getOperationsOverview();

    const statuses = overview.needsAttention.map((shipment) => shipment.status).sort();
    expect(statuses).toEqual(["DELAYED", "EXCEPTION"]);
  });

  it("orders recent activity by last update and reflects a new change", async () => {
    const delivered = await prisma.shipment.findUniqueOrThrow({
      where: { trackingNumber: "TRK-TEST-002" },
    });
    await prisma.shipment.update({
      where: { id: delivered.id },
      data: { currentLocation: "Updated just now" },
    });

    const overview = await getOperationsOverview();

    expect(overview.recentlyUpdated[0]?.trackingNumber).toBe("TRK-TEST-002");
  });

  it("returns list items only, with no notes or staff data", async () => {
    const overview = await getOperationsOverview();
    const raw = JSON.stringify(overview);

    expect(raw).not.toContain(NOTE_CANARY);
    expect(raw).not.toContain("passwordHash");
    expect(Object.keys(overview.recentlyUpdated[0]!).sort()).toEqual(
      [
        "currentLocation",
        "destination",
        "estimatedDelivery",
        "id",
        "origin",
        "status",
        "trackingNumber",
        "updatedAt",
      ].sort(),
    );
  });

  it("counts open enquiries for the navigation badge", async () => {
    expect(await countOpenEnquiries()).toBe(1);

    await prisma.enquiry.updateMany({ data: { status: "RESOLVED" } });

    expect(await countOpenEnquiries()).toBe(0);
  });
});
