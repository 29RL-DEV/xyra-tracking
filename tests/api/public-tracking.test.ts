import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/shipments/[trackingNumber]/route";
import { PUBLIC_SHIPMENT_KEYS } from "@/lib/dto/shipment";
import { PUBLIC_EVENT_KEYS } from "@/lib/dto/event";
import type { PublicTrackingResult } from "@/lib/dto/shipment";
import { get, params, readJson, type ErrorBody } from "../helpers/request";
import { NOTE_CANARY, resetDatabase, seedFixtures } from "../helpers/fixtures";

async function track(trackingNumber: string) {
  return GET(get(`/api/shipments/${trackingNumber}`), params({ trackingNumber }));
}

describe("GET /api/shipments/:trackingNumber", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
  });

  it("returns a shipment and its events for a known tracking number", async () => {
    const response = await track("TRK-TEST-001");
    expect(response.status).toBe(200);

    const body = await readJson<PublicTrackingResult>(response);
    expect(body.shipment.trackingNumber).toBe("TRK-TEST-001");
    expect(body.shipment.status).toBe("IN_TRANSIT");
    expect(body.events).toHaveLength(2);
  });

  it("is case-insensitive, because customers retype numbers from labels", async () => {
    const response = await track("trk-test-001");
    expect(response.status).toBe(200);
  });

  it("returns 404 for an unknown tracking number, not 200 and not 500", async () => {
    const response = await track("TRK-NOPE-999");
    expect(response.status).toBe(404);

    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("SHIPMENT_NOT_FOUND");
  });

  it("returns 400 for a malformed tracking number", async () => {
    const response = await track("ab");
    expect(response.status).toBe(400);

    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fields?.trackingNumber).toBeDefined();
  });

  it("orders events newest first and marks the latest one first in the list", async () => {
    const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-001"));

    const times = body.events.map((event) => Date.parse(event.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(body.events[0]?.type).toBe("IN_TRANSIT");
  });

  it("returns an empty event list for a shipment with no events", async () => {
    const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-005"));

    expect(body.events).toEqual([]);
    expect(body.shipment.status).toBe("CREATED");
  });

  it("represents a delivered shipment with a delivered event", async () => {
    const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-002"));

    expect(body.shipment.status).toBe("DELIVERED");
    expect(body.events.some((event) => event.type === "DELIVERED")).toBe(true);
  });

  it("exposes both the current and the original estimate for a delayed shipment", async () => {
    const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-003"));

    expect(body.shipment.status).toBe("DELAYED");
    expect(body.shipment.originalEstimatedDelivery).not.toBeNull();
    expect(body.shipment.originalEstimatedDelivery).not.toBe(
      body.shipment.estimatedDelivery,
    );
    // The delay must be explainable in words, not by colour alone.
    expect(body.events[0]?.message).toContain("Delayed");
  });

  it("carries an explanation on an exception shipment", async () => {
    const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-004"));

    expect(body.shipment.status).toBe("EXCEPTION");
    expect(body.events[0]?.message.length).toBeGreaterThan(20);
  });

  describe("data-leakage boundary", () => {
    it("never includes internal note text anywhere in the serialised payload", async () => {
      const response = await track("TRK-TEST-001");
      const raw = JSON.stringify(await readJson<unknown>(response));

      // A string search, not a key check: this catches a note appearing at any
      // depth, under any key name, including one added later.
      expect(raw).not.toContain(NOTE_CANARY);
      expect(raw.toLowerCase()).not.toContain("internalnote");
    });

    it("returns exactly the allow-listed shipment fields and no others", async () => {
      const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-001"));

      expect(Object.keys(body.shipment).sort()).toEqual(
        [...PUBLIC_SHIPMENT_KEYS].sort(),
      );
    });

    it("returns exactly the allow-listed event fields and no others", async () => {
      const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-001"));

      for (const event of body.events) {
        expect(Object.keys(event).sort()).toEqual([...PUBLIC_EVENT_KEYS].sort());
      }
    });

    it("does not expose the internal shipment identifier", async () => {
      const body = await readJson<PublicTrackingResult>(await track("TRK-TEST-001"));

      expect("id" in body.shipment).toBe(false);
    });
  });
});
