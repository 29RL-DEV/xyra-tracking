import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "@/app/api/staff/shipments/route";
import { GET as detail, PATCH as update } from "@/app/api/staff/shipments/[id]/route";
import { GET as publicTrack } from "@/app/api/shipments/[trackingNumber]/route";
import { prisma } from "@/lib/db";
import { GENERATED_TRACKING_NUMBER_PATTERN } from "@/lib/domain/tracking-number";
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

    it("answers a page far past any list with 400, not a failed query", async () => {
      for (const page of ["1e20", "99999999999999999999", "10001"]) {
        const response = await list(get(`/api/staff/shipments?page=${page}`));
        expect(response.status, page).toBe(400);
        expect((await readJson<ErrorBody>(response)).error.fields?.page).toBeDefined();
      }

      const last = await list(get("/api/staff/shipments?page=10000"));
      expect(last.status).toBe(200);
      expect((await readJson<{ shipments: unknown[] }>(last)).shipments).toEqual([]);
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
    it("creates a shipment with a generated random tracking number", async () => {
      const response = await create(send("/api/staff/shipments", "POST", VALID_SHIPMENT));
      expect(response.status).toBe(201);

      const body = await readJson<{ shipment: StaffShipment }>(response);
      expect(body.shipment.trackingNumber).toMatch(GENERATED_TRACKING_NUMBER_PATTERN);
      expect(await prisma.shipment.count()).toBe(6);
    });

    it("refuses a tracking number chosen by the caller, so every new number is generated", async () => {
      for (const trackingNumber of ["TRK-DEMO-050", "TRK-7KQ9M4ZT8P2X6N5D", ""]) {
        const response = await create(
          send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, trackingNumber }),
        );

        expect(response.status).toBe(400);
        expect((await readJson<ErrorBody>(response)).error.fields?.trackingNumber).toBeDefined();
      }
      expect(await prisma.shipment.count()).toBe(5);
    });

    it("draws a fresh number when a generated one is already taken", async () => {
      // All-zero random bytes give TRK-0000000000000000; a shipment already has it.
      await prisma.shipment.create({
        data: {
          trackingNumber: "TRK-0000000000000000",
          originCity: "Pelforth",
          originCountry: "United Kingdom",
          destinationCity: "Redhaven",
          destinationCountry: "United Kingdom",
          estimatedDelivery: new Date("2026-12-01T00:00:00.000Z"),
        },
      });
      const random = vi
        .spyOn(globalThis.crypto, "getRandomValues")
        .mockImplementationOnce((array) => array);

      try {
        const response = await create(send("/api/staff/shipments", "POST", VALID_SHIPMENT));

        expect(response.status).toBe(201);
        const { shipment } = await readJson<{ shipment: StaffShipment }>(response);
        expect(shipment.trackingNumber).toMatch(GENERATED_TRACKING_NUMBER_PATTERN);
        expect(shipment.trackingNumber).not.toBe("TRK-0000000000000000");
        expect(await prisma.shipment.count()).toBe(7);
      } finally {
        random.mockRestore();
      }
    });

    it("gives no way from one new number to another", async () => {
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
      const numbers: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await create(send("/api/staff/shipments", "POST", VALID_SHIPMENT));
        numbers.push((await readJson<{ shipment: StaffShipment }>(response)).shipment.trackingNumber);
      }

      // The numbers either side of each one, as a sequence would place them,
      // lead nowhere.
      for (const number of numbers) {
        const last = alphabet.indexOf(number[number.length - 1]!);
        for (const step of [-1, 1]) {
          const neighbour = number.slice(0, -1) + alphabet[(last + step + 32) % 32];
          const response = await publicTrack(
            get(`/api/shipments/${neighbour}`),
            params({ trackingNumber: neighbour }),
          );
          expect(response.status, neighbour).toBe(404);
        }
      }
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

    it("refuses a date that does not exist rather than moving it to another day", async () => {
      for (const estimatedDelivery of ["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01"]) {
        const response = await create(
          send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, estimatedDelivery }),
        );

        expect(response.status, estimatedDelivery).toBe(400);
        expect((await readJson<ErrorBody>(response)).error.fields?.estimatedDelivery).toBeDefined();
      }
      expect(await prisma.shipment.count()).toBe(5);

      // A leap day is a real date.
      const leapDay = await create(
        send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, estimatedDelivery: "2028-02-29" }),
      );
      expect(leapDay.status).toBe(201);
      expect((await readJson<{ shipment: StaffShipment }>(leapDay)).shipment.estimatedDelivery).toBe(
        "2028-02-29",
      );
    });

    it("keeps a weight to the two decimal places the database stores, never rounding it to zero", async () => {
      for (const weightKg of [0.001, 0.004, 1.234, "12.345"]) {
        const response = await create(send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, weightKg }));

        expect(response.status, String(weightKg)).toBe(400);
        expect((await readJson<ErrorBody>(response)).error.fields?.weightKg).toBeDefined();
      }

      for (const weightKg of [0.01, 4.35, "12.5"]) {
        const response = await create(send("/api/staff/shipments", "POST", { ...VALID_SHIPMENT, weightKg }));
        expect(response.status, String(weightKg)).toBe(201);
        expect((await readJson<{ shipment: StaffShipment }>(response)).shipment.weightKg).toBe(Number(weightKg));
      }
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
      const raw = await publicResponse.text();
      const body = JSON.parse(raw) as PublicTrackingResult;
      // Creation is the first event the customer sees.
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({ type: "CREATED", location: VALID_SHIPMENT.originCity });
      // The public handle is the tracking number; the internal id stays inside.
      expect(body.shipment).not.toHaveProperty("id");
      expect(raw).not.toContain(created.shipment.id);
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
