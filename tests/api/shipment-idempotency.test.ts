import { beforeEach, describe, expect, it } from "vitest";
import { POST as create } from "@/app/api/staff/shipments/route";
import { prisma } from "@/lib/db";
import type { StaffShipment } from "@/lib/dto/shipment";
import { readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn, type Fixtures } from "../helpers/fixtures";

/**
 * A create sent with an Idempotency-Key can be retried safely: a repeat of it,
 * sent afterwards or at the same moment, is answered with the shipment the
 * first one created instead of making another.
 */

const NEW_SHIPMENT = {
  originCity: "Pelforth",
  originCountry: "United Kingdom",
  destinationCity: "Redhaven",
  destinationCountry: "United Kingdom",
  estimatedDelivery: "2030-01-01",
  packageCount: 1,
};

const KEY = "create-7f3a9c2e-4b1d";

function post(body: unknown, key?: string) {
  return create(
    send("/api/staff/shipments", "POST", body, key === undefined ? {} : { "Idempotency-Key": key }),
  );
}

async function shipmentOf(response: Response): Promise<StaffShipment> {
  return (await readJson<{ shipment: StaffShipment }>(response)).shipment;
}

describe("idempotent shipment creation", () => {
  let fixtures: Fixtures;
  let before: number;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);
    before = await prisma.shipment.count();
  });

  it("answers a retry with the same key with the shipment it already created", async () => {
    const first = await post(NEW_SHIPMENT, KEY);
    const retry = await post(NEW_SHIPMENT, KEY);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");

    // The same body, shape and all, as the request that did the work.
    expect(await readJson(retry)).toEqual(await readJson(first));

    expect(await prisma.shipment.count()).toBe(before + 1);
    expect(await prisma.shipmentCreationKey.count()).toBe(1);
  });

  it("creates exactly one shipment from twenty identical requests sent together", async () => {
    const REQUESTS = 20;

    const responses = await Promise.all(
      Array.from({ length: REQUESTS }, () => post(NEW_SHIPMENT, KEY)),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(REQUESTS).fill(201));

    const ids = await Promise.all(responses.map(async (response) => (await shipmentOf(response)).id));
    expect(new Set(ids).size).toBe(1);

    // One request did the work; every other one says it was a repeat.
    expect(
      responses.filter((response) => response.headers.get("Idempotent-Replayed") === "true"),
    ).toHaveLength(REQUESTS - 1);

    expect(await prisma.shipment.count()).toBe(before + 1);
    expect(await prisma.shipmentCreationKey.findMany({ select: { shipmentId: true } })).toEqual([
      { shipmentId: ids[0] },
    ]);
    // The losers' shipments were rolled back with their opening event.
    expect(await prisma.trackingEvent.count({ where: { shipmentId: ids[0] } })).toBe(1);
  });

  it("refuses the same key sent with different details, and creates nothing", async () => {
    const original = await shipmentOf(await post(NEW_SHIPMENT, KEY));

    const reused = await post({ ...NEW_SHIPMENT, packageCount: 2 }, KEY);

    expect(reused.status).toBe(422);
    expect((await readJson<ErrorBody>(reused)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.shipment.count()).toBe(before + 1);

    // The key still answers for the request that first used it.
    const repeat = await post(NEW_SHIPMENT, KEY);
    expect(repeat.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await shipmentOf(repeat)).id).toBe(original.id);
  });

  it("creates a separate shipment for each different key", async () => {
    const first = await post(NEW_SHIPMENT, `${KEY}-first`);
    const second = await post(NEW_SHIPMENT, `${KEY}-second`);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.headers.get("Idempotent-Replayed")).toBeNull();
    expect((await shipmentOf(first)).id).not.toBe((await shipmentOf(second)).id);

    expect(await prisma.shipment.count()).toBe(before + 2);
    expect(await prisma.shipmentCreationKey.count()).toBe(2);
  });

  it("rejects a malformed key with 400 and creates nothing", async () => {
    for (const key of ["", "short", "x".repeat(129), "has spaces in it", "semi;colon;key"]) {
      const response = await post(NEW_SHIPMENT, key);

      expect(response.status, JSON.stringify(key)).toBe(400);
      expect((await readJson<ErrorBody>(response)).error.code).toBe("VALIDATION_FAILED");
    }

    expect(await prisma.shipment.count()).toBe(before);
    expect(await prisma.shipmentCreationKey.count()).toBe(0);
  });

  it("does not use up a key on a request that failed validation", async () => {
    const rejected = await post({ ...NEW_SHIPMENT, originCity: "" }, KEY);

    expect(rejected.status).toBe(400);
    expect(await prisma.shipmentCreationKey.count()).toBe(0);

    const accepted = await post(NEW_SHIPMENT, KEY);

    expect(accepted.status).toBe(201);
    expect(accepted.headers.get("Idempotent-Replayed")).toBeNull();
    expect(await prisma.shipment.count()).toBe(before + 1);
    expect(await prisma.shipmentCreationKey.count()).toBe(1);
  });

  it("keeps each staff member's keys to themselves", async () => {
    const colleague = await prisma.staffUser.create({
      data: {
        email: "colleague@demo.test",
        name: "Second Operator",
        passwordHash: "not-used-by-this-test",
      },
      select: { id: true },
    });

    const mine = await post(NEW_SHIPMENT, KEY);
    await signIn(colleague.id);
    const theirs = await post(NEW_SHIPMENT, KEY);

    expect([mine.status, theirs.status]).toEqual([201, 201]);
    expect(theirs.headers.get("Idempotent-Replayed")).toBeNull();
    expect((await shipmentOf(theirs)).id).not.toBe((await shipmentOf(mine)).id);
    expect(await prisma.shipment.count()).toBe(before + 2);
  });

  it("leaves a create without a key as it was: every request makes a shipment", async () => {
    const first = await post(NEW_SHIPMENT);
    const second = await post(NEW_SHIPMENT);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.headers.get("Idempotent-Replayed")).toBeNull();
    expect((await shipmentOf(first)).id).not.toBe((await shipmentOf(second)).id);

    expect(await prisma.shipment.count()).toBe(before + 2);
    expect(await prisma.shipmentCreationKey.count()).toBe(0);
  });
});
