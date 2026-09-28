import type { ShipmentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as addEvent } from "@/app/api/staff/shipments/[id]/events/route";
import { POST as createShipmentRoute } from "@/app/api/staff/shipments/route";
import { PATCH as patchShipment } from "@/app/api/staff/shipments/[id]/route";
import { prisma } from "@/lib/db";
import { EVENT_ORDER_BY } from "@/lib/domain/ordering";
import { GENERATED_TRACKING_NUMBER_PATTERN } from "@/lib/domain/tracking-number";
import { allowedNextStatuses, journeyStep } from "@/lib/domain/status";
import { params, readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn } from "../helpers/fixtures";

/**
 * Requests that reach one shipment at the same moment, against the real
 * database. A race does not go wrong every time, so each case runs several
 * rounds, each on a fresh shipment.
 */
const ROUNDS = 10;

const ORIGINAL_ETA = "2030-01-01";

const NEW_SHIPMENT = {
  originCity: "Pelforth",
  originCountry: "United Kingdom",
  destinationCity: "Redhaven",
  destinationCountry: "United Kingdom",
  estimatedDelivery: ORIGINAL_ETA,
  packageCount: 1,
};

let created = 0;

/** A shipment whose journey has reached `step`, one event per step. */
async function shipmentAt(step: "IN_TRANSIT" | "OUT_FOR_DELIVERY"): Promise<string> {
  const journey: ShipmentStatus[] = ["CREATED", "COLLECTED", "IN_TRANSIT"];
  if (step === "OUT_FOR_DELIVERY") journey.push("OUT_FOR_DELIVERY");

  created += 1;

  const shipment = await prisma.shipment.create({
    data: {
      trackingNumber: `TRK-RACE-${String(created).padStart(3, "0")}`,
      status: step,
      originCity: "Ashmarket",
      originCountry: "United Kingdom",
      destinationCity: "Westmoor Quay",
      destinationCountry: "United Kingdom",
      estimatedDelivery: new Date(`${ORIGINAL_ETA}T00:00:00.000Z`),
      currentLocation: "Gralebridge hub",
      events: {
        create: journey.map((type, index) => ({
          type,
          occurredAt: new Date(Date.now() - (journey.length - index) * 3_600_000),
          location: "Gralebridge hub",
          message: "An earlier step of the journey.",
        })),
      },
    },
    select: { id: true },
  });

  return shipment.id;
}

function postEvent(
  id: string,
  event: { type: ShipmentStatus; message?: string; occurredAt?: string },
) {
  return addEvent(
    send(`/api/staff/shipments/${id}/events`, "POST", { location: "Westmoor Quay", ...event }),
    params({ id }),
  );
}

function patch(id: string, body: Record<string, unknown>) {
  return patchShipment(send(`/api/staff/shipments/${id}`, "PATCH", body), params({ id }));
}

/** The shipment's status, and its timeline newest first. */
async function stateOf(id: string) {
  const [shipment, events] = await Promise.all([
    prisma.shipment.findUniqueOrThrow({ where: { id }, select: { status: true } }),
    prisma.trackingEvent.findMany({
      where: { shipmentId: id },
      orderBy: [...EVENT_ORDER_BY],
      select: { type: true },
    }),
  ]);

  return { status: shipment.status, timeline: events.map((event) => event.type) };
}

/** What must hold after any race: the status is the latest event, and nothing follows a delivery. */
function expectConsistent({ status, timeline }: { status: ShipmentStatus; timeline: ShipmentStatus[] }) {
  expect(status).toBe(timeline[0]);

  const deliveries = timeline.filter((type) => type === "DELIVERED").length;
  expect(deliveries).toBeLessThanOrEqual(1);
  if (deliveries === 1) expect(timeline[0]).toBe("DELIVERED");
}

describe("concurrent writes to one shipment", () => {
  beforeEach(async () => {
    await resetDatabase();
    const { staffId } = await seedFixtures();
    await signIn(staffId);
  });

  it("never records an exception after a delivery it raced", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("OUT_FOR_DELIVERY");

      const [delivered, exception] = await Promise.all([
        postEvent(id, { type: "DELIVERED" }),
        postEvent(id, { type: "EXCEPTION", message: "The driver could not get into the building." }),
      ]);
      const state = await stateOf(id);

      expectConsistent(state);
      // Whichever is applied first, the delivery stands. An exception applied
      // before it is legitimate history, since a shipment held on its delivery
      // round can still be delivered. One applied after it is refused.
      expect(delivered.status).toBe(201);
      expect(state.status).toBe("DELIVERED");

      if (exception.status === 201) {
        expect(state.timeline.slice(0, 2)).toEqual(["DELIVERED", "EXCEPTION"]);
      } else {
        expect(exception.status).toBe(422);
        expect((await readJson<ErrorBody>(exception)).error.code).toBe("INVALID_STATUS_TRANSITION");
        expect(state.timeline).not.toContain("EXCEPTION");
      }
    }
  });

  it("accepts exactly one of two deliveries sent together", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("OUT_FOR_DELIVERY");

      const responses = await Promise.all([
        postEvent(id, { type: "DELIVERED" }),
        postEvent(id, { type: "DELIVERED" }),
      ]);
      const state = await stateOf(id);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
      expect(state.timeline.filter((type) => type === "DELIVERED")).toHaveLength(1);
      expectConsistent(state);
    }
  });

  it("gives a status sent through PATCH no way around a delivery", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("OUT_FOR_DELIVERY");

      const [delivered, patched] = await Promise.all([
        postEvent(id, { type: "DELIVERED" }),
        patch(id, { status: "DELAYED" }),
      ]);
      const state = await stateOf(id);

      expect(delivered.status).toBe(201);
      expect(patched.status).toBe(400);
      expect(state.status).toBe("DELIVERED");
      expect(state.timeline).not.toContain("DELAYED");
      expectConsistent(state);
    }
  });

  it("keeps the status in step with the latest event when two valid events race", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("IN_TRANSIT");

      const responses = await Promise.all([
        postEvent(id, { type: "OUT_FOR_DELIVERY" }),
        postEvent(id, { type: "DELAYED", message: "Held at the depot by a vehicle fault." }),
      ]);

      // Either order is a valid journey, so both are recorded.
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expectConsistent(await stateOf(id));
    }
  });

  it("accepts only one of two events that are each valid alone but not together", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("IN_TRANSIT");
      expect(
        (await postEvent(id, { type: "DELAYED", message: "Held at the hub by a vehicle fault." })).status,
      ).toBe(201);

      // After the delay the shipment can carry on in transit, and the history
      // can take the delivery round the delay happened on — but a journey that
      // was out for delivery cannot then go back into transit.
      const responses = await Promise.all([
        postEvent(id, {
          type: "OUT_FOR_DELIVERY",
          occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        }),
        postEvent(id, { type: "IN_TRANSIT" }),
      ]);
      const state = await stateOf(id);
      const oldestFirst = [...state.timeline].reverse();

      expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
      expect(
        oldestFirst.every(
          (type, index) =>
            index === 0 ||
            allowedNextStatuses(
              oldestFirst[index - 1]!,
              journeyStep(oldestFirst.slice(0, index).reverse()),
            ).includes(type),
        ),
      ).toBe(true);
      expectConsistent(state);
    }
  });

  it("gives every shipment created at the same moment its own random number", async () => {
    const CREATES = 30;
    const before = await prisma.shipment.count();

    const responses = await Promise.all(
      Array.from({ length: CREATES }, () => createShipmentRoute(send("/api/staff/shipments", "POST", NEW_SHIPMENT))),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(CREATES).fill(201));

    const numbers = await Promise.all(
      responses.map(async (response) => (await readJson<{ shipment: { trackingNumber: string } }>(response)).shipment.trackingNumber),
    );
    for (const number of numbers) {
      expect(number).toMatch(GENERATED_TRACKING_NUMBER_PATTERN);
    }
    expect(new Set(numbers).size).toBe(CREATES);

    // Exactly one row per request, and the database holds no duplicate.
    const rows = await prisma.shipment.findMany({ select: { trackingNumber: true } });
    expect(rows).toHaveLength(before + CREATES);
    expect(new Set(rows.map((row) => row.trackingNumber)).size).toBe(rows.length);
  });

  it("refuses any event once a race has ended in delivery", async () => {
    const id = await shipmentAt("OUT_FOR_DELIVERY");

    await Promise.all([
      postEvent(id, { type: "DELIVERED" }),
      postEvent(id, { type: "DELIVERED" }),
    ]);

    const after = await postEvent(id, { type: "EXCEPTION", message: "Reported missing after delivery." });

    expect(after.status).toBe(422);
    expectConsistent(await stateOf(id));
  });

  it("applies two edits sent together one after the other, so the change history is true", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await shipmentAt("IN_TRANSIT");

      const responses = await Promise.all([
        patch(id, { estimatedDelivery: "2030-02-01" }),
        patch(id, { estimatedDelivery: "2030-03-01" }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);

      const entries = await prisma.shipmentAuditEntry.findMany({
        where: { shipmentId: id, action: "UPDATED" },
        select: { changes: true },
      });
      const moves = entries.map(
        (entry) => (entry.changes as { estimatedDelivery: { from: string; to: string } }).estimatedDelivery,
      );

      // The first edit replaced the original date, and the second replaced the
      // first edit's date, not the original one as well.
      const first = moves.find((move) => move.from === ORIGINAL_ETA);
      const second = moves.find((move) => move !== first);
      expect(moves).toHaveLength(2);
      expect(second?.from).toBe(first?.to);

      const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(shipment.estimatedDelivery.toISOString().slice(0, 10)).toBe(second?.to);
      expect(shipment.originalEstimatedDelivery?.toISOString().slice(0, 10)).toBe(ORIGINAL_ETA);
    }
  });
});
