import { beforeEach, describe, expect, it } from "vitest";
import { GET as list, POST as create } from "@/app/api/staff/shipments/route";
import { GET as detail, PATCH as update } from "@/app/api/staff/shipments/[id]/route";
import { GET as publicTrack } from "@/app/api/shipments/[trackingNumber]/route";
import { prisma } from "@/lib/db";
import type { StaffShipment, StaffShipmentDetail } from "@/lib/dto/shipment";
import type { PublicTrackingResult } from "@/lib/dto/shipment";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn, type Fixtures } from "../helpers/fixtures";

const VALID_SHIPMENT = {
  originCity: "Pelforth",
  originCountry: "United Kingdom",
  destinationCity: "Redhaven",
  destinationCountry: "United Kingdom",
  estimatedDelivery: "2026-12-01",
  serviceLevel: "EXPRESS",
  packageCount: 3,
  status: "CREATED",
};

describe("staff shipments API", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);
  });

  describe("listing, search and filters", () => {
    it("returns every seeded shipment with the at-a-glance fields", async () => {
      const response = await list(get("/api/staff/shipments"));
      expect(response.status).toBe(200);

      const body = await readJson<{
        shipments: Array<Record<string, unknown>>;
        total: number;
      }>(response);

      expect(body.total).toBe(5);
      expect(Object.keys(body.shipments[0]!).sort()).toEqual(
        [
          "id",
          "trackingNumber",
          "status",
          "origin",
          "destination",
          "estimatedDelivery",
          "currentLocation",
          "updatedAt",
        ].sort(),
      );
    });

    it("filters by status", async () => {
      const response = await list(get("/api/staff/shipments?status=DELAYED"));
      const body = await readJson<{ shipments: StaffShipment[] }>(response);

      expect(body.shipments).toHaveLength(1);
      expect(body.shipments[0]?.status).toBe("DELAYED");
    });

    it("filters delayed and held shipments together, as the overview counts them", async () => {
      const response = await list(get("/api/staff/shipments?status=NEEDS_ATTENTION"));
      expect(response.status).toBe(200);

      const body = await readJson<{ shipments: StaffShipment[]; total: number }>(response);

      expect(body.total).toBe(2);
      expect(body.shipments.map((shipment) => shipment.status).sort()).toEqual([
        "DELAYED",
        "EXCEPTION",
      ]);
    });

    it("rejects an unsupported status with 400, not 500", async () => {
      const response = await list(get("/api/staff/shipments?status=NONSENSE"));

      expect(response.status).toBe(400);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.fields?.status).toBeDefined();
    });

    it("searches by partial, case-insensitive tracking number", async () => {
      const response = await list(get("/api/staff/shipments?q=test-00"));
      const body = await readJson<{ total: number }>(response);

      expect(body.total).toBe(5);
    });

    it("combines search and status filter", async () => {
      const response = await list(
        get("/api/staff/shipments?q=TRK-TEST&status=DELIVERED"),
      );
      const body = await readJson<{ shipments: StaffShipment[] }>(response);

      expect(body.shipments).toHaveLength(1);
      expect(body.shipments[0]?.trackingNumber).toBe("TRK-TEST-002");
    });

    it("searches for what was typed, treating % and _ as ordinary characters", async () => {
      // Unescaped, each of these is a LIKE wildcard: % and _ alone match every
      // shipment, and TEST_001 matches TRK-TEST-001.
      for (const q of ["%", "_", "TRK%001", "TEST_001", "\\"]) {
        const response = await list(get(`/api/staff/shipments?q=${encodeURIComponent(q)}`));

        expect(response.status).toBe(200);
        expect((await readJson<{ total: number }>(response)).total).toBe(0);
      }

      const exact = await list(get("/api/staff/shipments?q=TEST-001"));
      expect((await readJson<{ total: number }>(exact)).total).toBe(1);
    });

    it("returns an empty list rather than an error when nothing matches", async () => {
      const response = await list(get("/api/staff/shipments?q=NOTHINGMATCHES"));

      expect(response.status).toBe(200);
      const body = await readJson<{ shipments: unknown[]; total: number }>(response);
      expect(body.shipments).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("orders the most recently updated shipment first", async () => {
      await update(
        send(`/api/staff/shipments/${fixtures.exceptionId}`, "PATCH", {
          currentLocation: "Somewhere new",
        }),
        params({ id: fixtures.exceptionId }),
      );

      const body = await readJson<{ shipments: StaffShipment[] }>(
        await list(get("/api/staff/shipments")),
      );

      expect(body.shipments[0]?.id).toBe(fixtures.exceptionId);
    });
  });

  describe("creating a shipment", () => {
    it("creates a shipment and generates a unique tracking number", async () => {
      const response = await create(send("/api/staff/shipments", "POST", VALID_SHIPMENT));
      expect(response.status).toBe(201);

      const body = await readJson<{ shipment: StaffShipment }>(response);
      // No fixture uses the TRK-DEMO- sequence, so the first number is issued.
      expect(body.shipment.trackingNumber).toBe("TRK-DEMO-001");
      expect(await prisma.shipment.count()).toBe(6);
    });

    it("accepts a supplied tracking number, upper-cases and pads it", async () => {
      const response = await create(
        send("/api/staff/shipments", "POST", {
          ...VALID_SHIPMENT,
          trackingNumber: "trk-demo-7",
        }),
      );

      const body = await readJson<{ shipment: StaffShipment }>(response);
      expect(body.shipment.trackingNumber).toBe("TRK-DEMO-007");
    });

    it("rejects a duplicate tracking number with 409 and creates nothing", async () => {
      await create(
        send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, trackingNumber: "TRK-DEMO-050" }),
      );
      const before = await prisma.shipment.count();

      const response = await create(
        send("/api/staff/shipments", "POST", {
          ...VALID_SHIPMENT,
          trackingNumber: "TRK-DEMO-050",
        }),
      );

      expect(response.status).toBe(409);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.code).toBe("TRACKING_NUMBER_TAKEN");
      expect(await prisma.shipment.count()).toBe(before);
    });

    it("rejects missing required fields with per-field messages", async () => {
      const response = await create(
        send("/api/staff/shipments", "POST", {
          originCity: "Pelforth",
          originCountry: "United Kingdom",
          estimatedDelivery: "2026-12-01",
          serviceLevel: "STANDARD",
          packageCount: 1,
        }),
      );

      expect(response.status).toBe(400);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.fields?.destinationCity).toBeDefined();
      expect(body.error.fields?.destinationCountry).toBeDefined();
    });

    it("rejects an invalid status", async () => {
      const response = await create(
        send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, status: "TELEPORTED" }),
      );

      expect(response.status).toBe(400);
    });

    it("rejects unexpected fields rather than passing them to the database", async () => {
      const response = await create(
        send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, isAdmin: true }),
      );

      expect(response.status).toBe(400);
    });

    it("answers a weight or package count too large for the database with a 400, not a failed insert", async () => {
      for (const oversized of [
        { weightKg: 1_000_000 },
        { weightKg: "999999.995" },
        { packageCount: 2_147_483_648 },
        { packageCount: "3000000000" },
      ]) {
        const response = await create(
          send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, ...oversized }),
        );

        expect(response.status).toBe(400);
        const body = await readJson<ErrorBody>(response);
        expect(Object.keys(body.error.fields ?? {})).toEqual(Object.keys(oversized));
      }
      expect(await prisma.shipment.count()).toBe(5);

      // The largest values the columns hold are still accepted.
      const largest = await create(
        send("/api/staff/shipments", "POST", {
          ...VALID_SHIPMENT,
          weightKg: 999_999.99,
          packageCount: 2_147_483_647,
        }),
      );
      expect(largest.status).toBe(201);
    });

    it("makes a new shipment immediately trackable by the public endpoint", async () => {
      const created = await readJson<{ shipment: StaffShipment }>(
        await create(send("/api/staff/shipments", "POST", VALID_SHIPMENT)),
      );

      const trackingNumber = created.shipment.trackingNumber;
      const publicResponse = await publicTrack(
        get(`/api/shipments/${trackingNumber}`),
        params({ trackingNumber }),
      );

      expect(publicResponse.status).toBe(200);
      const body = await readJson<PublicTrackingResult>(publicResponse);
      // Creation is the first event the customer sees.
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({ type: "CREATED", location: VALID_SHIPMENT.originCity });
    });
  });

  describe("shipment detail", () => {
    it("returns the shipment with its events and internal notes", async () => {
      const response = await detail(
        get(`/api/staff/shipments/${fixtures.inTransitId}`),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(200);
      const body = await readJson<StaffShipmentDetail>(response);
      expect(body.events).toHaveLength(2);
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0]?.author.name).toBeTruthy();
    });

    it("returns 404 for an unknown shipment", async () => {
      const response = await detail(
        get("/api/staff/shipments/does-not-exist"),
        params({ id: "does-not-exist" }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("updating a shipment", () => {
    it("updates supplied fields and leaves the rest untouched", async () => {
      const before = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          currentLocation: "Thornbeck depot",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      expect(after.currentLocation).toBe("Thornbeck depot");
      expect(after.destinationCity).toBe(before.destinationCity);
      expect(after.packageCount).toBe(before.packageCount);
      expect(after.serviceLevel).toBe(before.serviceLevel);
    });

    it("never loses tracking history when details change", async () => {
      const before = await prisma.trackingEvent.count({
        where: { shipmentId: fixtures.inTransitId },
      });

      await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          estimatedDelivery: "2026-12-24",
          destinationCity: "Kelbury",
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(
        await prisma.trackingEvent.count({ where: { shipmentId: fixtures.inTransitId } }),
      ).toBe(before);
    });

    it("captures the original estimate the first time the ETA moves, and only then", async () => {
      const original = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          estimatedDelivery: "2026-12-10",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const afterFirst = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });
      expect(afterFirst.originalEstimatedDelivery?.toISOString()).toBe(
        original.estimatedDelivery.toISOString(),
      );

      await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          estimatedDelivery: "2026-12-20",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const afterSecond = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });
      // Still the first promise, not the previous revision.
      expect(afterSecond.originalEstimatedDelivery?.toISOString()).toBe(
        original.estimatedDelivery.toISOString(),
      );
    });

    it("refuses to change the tracking number and explains why", async () => {
      const response = await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          trackingNumber: "TRK-SOMETHING-ELSE",
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(400);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.code).toBe("IMMUTABLE_FIELD");
    });

    it("refuses a status change, which only a tracking event can make, and writes nothing", async () => {
      // Delayed and Exception included: through a tracking event they need an
      // explanation for the customer, so an edit must not be a way around it.
      for (const status of ["DELAYED", "EXCEPTION", "OUT_FOR_DELIVERY", "DELIVERED", "TELEPORTED"]) {
        const response = await update(
          send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", { status }),
          params({ id: fixtures.inTransitId }),
        );

        expect(response.status).toBe(400);
        expect((await readJson<ErrorBody>(response)).error.fields?.status).toBeDefined();
      }

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });
      expect(after.status).toBe("IN_TRANSIT");
      expect(
        await prisma.trackingEvent.count({ where: { shipmentId: fixtures.inTransitId } }),
      ).toBe(2);
      expect(
        await prisma.shipmentAuditEntry.count({ where: { shipmentId: fixtures.inTransitId } }),
      ).toBe(0);
    });

    it("rejects an oversized weight or package count on an edit too", async () => {
      for (const oversized of [{ weightKg: 1_000_000 }, { packageCount: 2_147_483_648 }]) {
        const response = await update(
          send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", oversized),
          params({ id: fixtures.inTransitId }),
        );

        expect(response.status).toBe(400);
        expect(Object.keys((await readJson<ErrorBody>(response)).error.fields ?? {})).toEqual(
          Object.keys(oversized),
        );
      }
    });

    it("reflects an edit on the public endpoint immediately", async () => {
      await update(
        send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
          currentLocation: "Thornbeck depot",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const body = await readJson<PublicTrackingResult>(
        await publicTrack(
          get("/api/shipments/TRK-TEST-001"),
          params({ trackingNumber: "TRK-TEST-001" }),
        ),
      );

      expect(body.shipment.currentLocation).toBe("Thornbeck depot");
    });
  });
});
