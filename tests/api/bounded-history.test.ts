import { beforeEach, describe, expect, it } from "vitest";
import { GET as publicLookup } from "@/app/api/shipments/[trackingNumber]/route";
import { GET as staffDetail, PATCH as patchShipment } from "@/app/api/staff/shipments/[id]/route";
import { prisma } from "@/lib/db";
import type { PublicTrackingResult, StaffShipmentDetail } from "@/lib/dto/shipment";
import {
  EVENT_HISTORY_LIMIT,
  NOTE_HISTORY_LIMIT,
} from "@/lib/services/shipment-service";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn, type Fixtures } from "../helpers/fixtures";

/**
 * History is append-only and never pruned, so a long-lived shipment keeps
 * accumulating events and notes. These tests make sure a page render reads
 * the newest slice rather than everything ever recorded.
 */
describe("bounded shipment history", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
  });

  async function addEvents(shipmentId: string, count: number) {
    const base = Date.now() - 60_000;
    await prisma.trackingEvent.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        shipmentId,
        // Index 0 is the newest, so it must survive the cut.
        occurredAt: new Date(base - index * 60_000),
        location: `Hub ${index}`,
        type: "IN_TRANSIT" as const,
        message: `Scanned at hub ${index}.`,
      })),
    });
  }

  it("returns only the newest events on the public tracking page", async () => {
    await addEvents(fixtures.inTransitId, EVENT_HISTORY_LIMIT + 25);

    const result = await readJson<PublicTrackingResult>(
      await publicLookup(
        get("/api/shipments/TRK-TEST-001"),
        params({ trackingNumber: "TRK-TEST-001" }),
      ),
    );

    expect(result.events).toHaveLength(EVENT_HISTORY_LIMIT);
    // Newest first, and the newest one is the event we added most recently.
    expect(result.events[0]?.location).toBe("Hub 0");
    const times = result.events.map((event) => Date.parse(event.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("bounds events and notes on the staff detail too", async () => {
    await addEvents(fixtures.inTransitId, EVENT_HISTORY_LIMIT + 10);
    await prisma.internalNote.createMany({
      data: Array.from({ length: NOTE_HISTORY_LIMIT + 10 }, (_, index) => ({
        shipmentId: fixtures.inTransitId,
        authorId: fixtures.staffId,
        body: `Operational note ${index}.`,
        createdAt: new Date(Date.now() - index * 1000),
      })),
    });
    await signIn(fixtures.staffId);

    const detail = await readJson<StaffShipmentDetail>(
      await staffDetail(
        get(`/api/staff/shipments/${fixtures.inTransitId}`),
        params({ id: fixtures.inTransitId }),
      ),
    );

    expect(detail.events).toHaveLength(EVENT_HISTORY_LIMIT);
    expect(detail.notes).toHaveLength(NOTE_HISTORY_LIMIT);
    expect(detail.notes[0]?.body).toBe("Operational note 0.");
  });

  it("returns every event when a shipment has fewer than the ceiling", async () => {
    const stored = await prisma.trackingEvent.count({
      where: { shipmentId: fixtures.inTransitId },
    });

    const result = await readJson<PublicTrackingResult>(
      await publicLookup(
        get("/api/shipments/TRK-TEST-001"),
        params({ trackingNumber: "TRK-TEST-001" }),
      ),
    );

    expect(result.events).toHaveLength(stored);
  });
});

describe("atomic shipment updates", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);
  });

  it("writes nothing when the delivered guard rejects part of an update", async () => {
    const before = await prisma.shipment.findUniqueOrThrow({
      where: { id: fixtures.inTransitId },
    });

    // A status the guard refuses, bundled with an ETA and location change that
    // would be valid on their own.
    const response = await patchShipment(
      send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
        status: "DELIVERED",
        estimatedDelivery: "2030-01-15",
        currentLocation: "Somewhere new",
      }),
      params({ id: fixtures.inTransitId }),
    );

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("DELIVERED_REQUIRES_EVENT");

    const after = await prisma.shipment.findUniqueOrThrow({
      where: { id: fixtures.inTransitId },
    });

    expect(after.status).toBe(before.status);
    expect(after.currentLocation).toBe(before.currentLocation);
    expect(after.estimatedDelivery.getTime()).toBe(before.estimatedDelivery.getTime());
    expect(after.originalEstimatedDelivery).toEqual(before.originalEstimatedDelivery);
  });

});
