import type { ShipmentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as addEvent } from "@/app/api/staff/shipments/[id]/events/route";
import { prisma } from "@/lib/db";
import { allowedNextStatuses, journeyStep } from "@/lib/domain/status";
import { params, readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn } from "../helpers/fixtures";

const HOUR = 3_600_000;

let created = 0;

/** A shipment whose history is exactly `events`, each dated `hoursAgo`. */
async function shipmentWithHistory(
  events: Array<{ type: ShipmentStatus; hoursAgo: number }>,
): Promise<string> {
  created += 1;
  const latest = events[events.length - 1]!;

  const shipment = await prisma.shipment.create({
    data: {
      trackingNumber: `TRK-HIST-${String(created).padStart(3, "0")}`,
      status: latest.type,
      originCity: "Ashmarket",
      originCountry: "United Kingdom",
      destinationCity: "Westmoor Quay",
      destinationCountry: "United Kingdom",
      estimatedDelivery: new Date("2030-01-01T00:00:00.000Z"),
      currentLocation: "Gralebridge hub",
      events: {
        create: events.map(({ type, hoursAgo }) => ({
          type,
          occurredAt: new Date(Date.now() - hoursAgo * HOUR),
          location: "Gralebridge hub",
          message: "An earlier step of the journey.",
        })),
      },
    },
    select: { id: true },
  });

  return shipment.id;
}

function post(id: string, body: Record<string, unknown>) {
  return addEvent(
    send(`/api/staff/shipments/${id}/events`, "POST", {
      location: "Calderwick hub",
      message: "An update for the customer.",
      ...body,
    }),
    params({ id }),
  );
}

/** Event types oldest first, in the order the timelines show them. */
async function journey(id: string): Promise<ShipmentStatus[]> {
  const events = await prisma.trackingEvent.findMany({
    where: { shipmentId: id },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { type: true },
  });
  return events.map((event) => event.type);
}

/** The present by the database's clock, the one that dates events recorded as happening now. */
async function databaseTime(): Promise<Date> {
  const [{ now }] = await prisma.$queryRaw<[{ now: Date }]>`SELECT clock_timestamp() AS now`;
  return now;
}

/**
 * Sets this process's clock `offsetMs` away from the real time, as on an
 * instance whose clock has drifted. Only Date is faked: timers, and with them
 * the database connection, keep running normally. Undone by vi.useRealTimers().
 */
function skewApplicationClock(offsetMs: number): void {
  const skewed = Date.now() + offsetMs;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(skewed);
}

/** True when every step of a journey, oldest first, follows the lifecycle rules. */
function isValidJourney(types: ShipmentStatus[]): boolean {
  return types.every(
    (type, index) =>
      index === 0 ||
      allowedNextStatuses(types[index - 1]!, journeyStep(types.slice(0, index).reverse())).includes(type),
  );
}

/** Created, collected, in transit, delayed, then moving again — each two hours apart. */
const DELAYED_AND_RESUMED: Array<{ type: ShipmentStatus; hoursAgo: number }> = [
  { type: "CREATED", hoursAgo: 10 },
  { type: "COLLECTED", hoursAgo: 8 },
  { type: "IN_TRANSIT", hoursAgo: 6 },
  { type: "DELAYED", hoursAgo: 4 },
  { type: "IN_TRANSIT", hoursAgo: 2 },
];

describe("tracking history integrity", () => {
  beforeEach(async () => {
    await resetDatabase();
    const { staffId } = await seedFixtures();
    await signIn(staffId);
  });

  it("accepts a full journey recorded in order, including a delay and a problem on the way", async () => {
    const id = await shipmentWithHistory([{ type: "CREATED", hoursAgo: 1 }]);

    for (const type of [
      "COLLECTED",
      "IN_TRANSIT",
      "DELAYED",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "EXCEPTION",
      "DELIVERED",
    ] as const) {
      expect((await post(id, { type })).status).toBe(201);
    }

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id } });
    expect(shipment.status).toBe("DELIVERED");
    expect(isValidJourney(await journey(id))).toBe(true);
  });

  it("refuses the audited insertion that made the journey run backwards, and writes nothing", async () => {
    const id = await shipmentWithHistory(DELAYED_AND_RESUMED);
    const before = await prisma.shipment.findUniqueOrThrow({ where: { id } });
    const auditBefore = await prisma.shipmentAuditEntry.count({ where: { shipmentId: id } });

    // Out for delivery between the first In transit and the delay would leave
    // the later In transit going backwards from the delivery round.
    const response = await post(id, {
      type: "OUT_FOR_DELIVERY",
      occurredAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    });

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("EVENT_OUT_OF_ORDER");

    expect(await journey(id)).toEqual(DELAYED_AND_RESUMED.map((event) => event.type));
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe(before.status);
    expect(after.currentLocation).toBe(before.currentLocation);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await prisma.shipmentAuditEntry.count({ where: { shipmentId: id } })).toBe(auditBefore);
  });

  // Each insertion is judged by the journey it would leave behind, not only
  // by the events on either side of it.
  it.each([
    { hoursAgo: 9, type: "COLLECTED", status: 422, why: "a second collection" },
    { hoursAgo: 7, type: "EXCEPTION", status: 201, why: "a problem that the journey carried on from" },
    { hoursAgo: 7, type: "OUT_FOR_DELIVERY", status: 422, why: "a delivery round before transit" },
    { hoursAgo: 5, type: "IN_TRANSIT", status: 201, why: "another hub on the way" },
    { hoursAgo: 5, type: "OUT_FOR_DELIVERY", status: 422, why: "a delivery round the later events run back from" },
    { hoursAgo: 3, type: "DELAYED", status: 201, why: "a second delay notice" },
    { hoursAgo: 3, type: "COLLECTED", status: 422, why: "a collection after transit" },
    { hoursAgo: 11, type: "COLLECTED", status: 422, why: "a time before the first event" },
  ] as const)("answers $status for $type dated $hoursAgo h ago: $why", async ({ hoursAgo, type, status }) => {
    const id = await shipmentWithHistory(DELAYED_AND_RESUMED);

    const response = await post(id, {
      type,
      occurredAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
    });

    expect(response.status).toBe(status);
    const types = await journey(id);
    expect(types).toHaveLength(DELAYED_AND_RESUMED.length + (status === 201 ? 1 : 0));
    expect(isValidJourney(types)).toBe(true);
    // A back-dated event never moves the shipment.
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id } })).status).toBe("IN_TRANSIT");
  });

  it("places an event with exactly the same time as another after it, and judges it there", async () => {
    const id = await shipmentWithHistory(DELAYED_AND_RESUMED);
    const transit = await prisma.trackingEvent.findFirstOrThrow({
      where: { shipmentId: id, type: "IN_TRANSIT" },
      orderBy: { occurredAt: "asc" },
    });
    const sameTime = transit.occurredAt.toISOString();

    // After the first In transit, another hub fits; a delivery round does not.
    expect((await post(id, { type: "OUT_FOR_DELIVERY", occurredAt: sameTime })).status).toBe(422);
    expect((await post(id, { type: "IN_TRANSIT", location: "Twin hub", occurredAt: sameTime })).status).toBe(201);

    const stored = await prisma.trackingEvent.findMany({
      where: { shipmentId: id },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { type: true, location: true },
    });
    expect(stored.map((event) => event.type)).toEqual([
      "CREATED",
      "COLLECTED",
      "IN_TRANSIT",
      "IN_TRANSIT",
      "DELAYED",
      "IN_TRANSIT",
    ]);
    expect(stored[3]!.location).toBe("Twin hub");
  });

  it("keeps delivery terminal: history before it must still lead to it", async () => {
    const id = await shipmentWithHistory([
      { type: "CREATED", hoursAgo: 8 },
      { type: "COLLECTED", hoursAgo: 6 },
      { type: "IN_TRANSIT", hoursAgo: 4 },
      { type: "OUT_FOR_DELIVERY", hoursAgo: 2 },
      { type: "DELIVERED", hoursAgo: 1 },
    ]);
    const between = new Date(Date.now() - 1.5 * HOUR).toISOString();

    // A problem on the delivery round can still end in delivery; going back
    // into transit cannot.
    expect((await post(id, { type: "IN_TRANSIT", occurredAt: between })).status).toBe(422);
    expect((await post(id, { type: "EXCEPTION", occurredAt: between })).status).toBe(201);
    // Nothing is accepted after it, and it cannot be recorded twice.
    expect((await post(id, { type: "IN_TRANSIT" })).status).toBe(422);
    expect((await post(id, { type: "DELIVERED" })).status).toBe(422);

    const types = await journey(id);
    expect(types[types.length - 1]).toBe("DELIVERED");
    expect(types.filter((type) => type === "DELIVERED")).toHaveLength(1);
    expect(isValidJourney(types)).toBe(true);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id } })).status).toBe("DELIVERED");
  });

  it("leaves every history valid through a long random sequence of current and back-dated events", async () => {
    const TYPES: ShipmentStatus[] = [
      "COLLECTED",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "DELAYED",
      "EXCEPTION",
    ];
    // A fixed seed, so a failure replays exactly.
    let seed = 20260927;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;

    let accepted = 0;
    let backDatedAccepted = 0;

    for (let shipment = 0; shipment < 6; shipment += 1) {
      const id = await shipmentWithHistory([{ type: "CREATED", hoursAgo: 10 }]);

      for (let step = 0; step < 25; step += 1) {
        const type = TYPES[Math.floor(random() * TYPES.length)]!;
        const backDated = random() < 0.45;
        const response = await post(id, {
          type,
          ...(backDated
            ? { occurredAt: new Date(Date.now() - random() * 10 * HOUR).toISOString() }
            : {}),
        });

        expect([201, 422]).toContain(response.status);
        if (response.status !== 201) continue;

        accepted += 1;
        if (backDated) backDatedAccepted += 1;

        const types = await journey(id);
        const current = await prisma.shipment.findUniqueOrThrow({ where: { id } });
        expect(isValidJourney(types), types.join(" > ")).toBe(true);
        expect(current.status).toBe(types[types.length - 1]);
      }
    }

    // The sequence exercised both kinds of insertion, not only rejections.
    expect(accepted).toBeGreaterThan(20);
    expect(backDatedAccepted).toBeGreaterThan(5);
  });

  // Several instances of the application serve requests, each with its own
  // clock. An event recorded as happening now is dated by the database's clock,
  // so none of them can date events out of the order they were applied in.
  describe("an event recorded as happening now, on an instance whose clock is wrong", () => {
    const TEN_MINUTES = 10 * 60_000;

    afterEach(() => {
      vi.useRealTimers();
    });

    it("still becomes the latest update when that clock runs behind", async () => {
      const id = await shipmentWithHistory(DELAYED_AND_RESUMED);

      // Recorded by an instance whose clock is right.
      expect((await post(id, { type: "DELAYED" })).status).toBe(201);

      // Moments later the shipment moves again, recorded by an instance ten
      // minutes behind. Dated by that clock, it would slip in under the delay
      // as history and leave the shipment showing as delayed.
      skewApplicationClock(-TEN_MINUTES);
      const response = await post(id, { type: "IN_TRANSIT" });
      vi.useRealTimers();

      expect(response.status).toBe(201);
      expect((await readJson<{ shipmentUpdated: boolean }>(response)).shipmentUpdated).toBe(true);
      const types = await journey(id);
      expect(types.slice(-2)).toEqual(["DELAYED", "IN_TRANSIT"]);
      expect(isValidJourney(types)).toBe(true);
      expect((await prisma.shipment.findUniqueOrThrow({ where: { id } })).status).toBe("IN_TRANSIT");
    });

    it("is not dated in the future when that clock runs ahead", async () => {
      const id = await shipmentWithHistory(DELAYED_AND_RESUMED);
      const earliest = await databaseTime();

      skewApplicationClock(TEN_MINUTES);
      const response = await post(id, { type: "OUT_FOR_DELIVERY" });
      vi.useRealTimers();
      const latest = await databaseTime();

      expect(response.status).toBe(201);
      const event = await prisma.trackingEvent.findFirstOrThrow({
        where: { shipmentId: id, type: "OUT_FOR_DELIVERY" },
      });
      // Dated by the database while the request ran, not ten minutes on.
      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(earliest.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(latest.getTime());
      expect((await prisma.shipment.findUniqueOrThrow({ where: { id } })).status).toBe(
        "OUT_FOR_DELIVERY",
      );
    });
  });
});
