import { beforeEach, describe, expect, it } from "vitest";
import { POST as addEvent } from "@/app/api/staff/shipments/[id]/events/route";
import { POST as addNote } from "@/app/api/staff/shipments/[id]/notes/route";
import { GET as staffDetail } from "@/app/api/staff/shipments/[id]/route";
import { GET as publicTrack } from "@/app/api/shipments/[trackingNumber]/route";
import { prisma } from "@/lib/db";
import type { PublicTrackingResult, StaffShipmentDetail } from "@/lib/dto/shipment";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import {
  NOTE_CANARY,
  resetDatabase,
  seedFixtures,
  signIn,
  type Fixtures,
} from "../helpers/fixtures";

const VALID_EVENT = {
  location: "Gralebridge regional hub",
  type: "IN_TRANSIT",
  message: "Arrived at the regional hub.",
};

describe("tracking events", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);
  });

  it("appends an event and returns it", async () => {
    const before = await prisma.trackingEvent.count({
      where: { shipmentId: fixtures.inTransitId },
    });

    const response = await addEvent(
      send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", VALID_EVENT),
      params({ id: fixtures.inTransitId }),
    );

    expect(response.status).toBe(201);
    expect(
      await prisma.trackingEvent.count({ where: { shipmentId: fixtures.inTransitId } }),
    ).toBe(before + 1);
  });

  it("records the authoring staff member from the session", async () => {
    await addEvent(
      send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", VALID_EVENT),
      params({ id: fixtures.inTransitId }),
    );

    const detail = await readJson<StaffShipmentDetail>(
      await staffDetail(
        get(`/api/staff/shipments/${fixtures.inTransitId}`),
        params({ id: fixtures.inTransitId }),
      ),
    );

    expect(detail.events[0]?.createdBy?.id).toBe(fixtures.staffId);
  });

  it("shows the new event on the public timeline", async () => {
    await addEvent(
      send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
        ...VALID_EVENT,
        message: "A brand new customer-visible update.",
      }),
      params({ id: fixtures.inTransitId }),
    );

    const body = await readJson<PublicTrackingResult>(
      await publicTrack(
        get("/api/shipments/TRK-TEST-001"),
        params({ trackingNumber: "TRK-TEST-001" }),
      ),
    );

    expect(body.events[0]?.message).toBe("A brand new customer-visible update.");
  });

  describe("append-only history", () => {
    it("leaves existing events byte-identical after a full edit sequence", async () => {
      const before = await prisma.trackingEvent.findMany({
        where: { shipmentId: fixtures.inTransitId },
        orderBy: { id: "asc" },
      });

      await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", VALID_EVENT),
        params({ id: fixtures.inTransitId }),
      );
      await addNote(
        send(`/api/staff/shipments/${fixtures.inTransitId}/notes`, "POST", {
          body: "A note that must not disturb the timeline.",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const after = await prisma.trackingEvent.findMany({
        where: { shipmentId: fixtures.inTransitId, id: { in: before.map((e) => e.id) } },
        orderBy: { id: "asc" },
      });

      expect(after).toEqual(before);
    });
  });

  describe("validation", () => {
    it("rejects a missing location, a too-short message, or an unsupported type", async () => {
      const noLocation = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          type: "IN_TRANSIT",
          message: "No location supplied here.",
        }),
        params({ id: fixtures.inTransitId }),
      );
      expect(noLocation.status).toBe(400);
      expect((await readJson<ErrorBody>(noLocation)).error.fields?.location).toBeDefined();

      const shortMessage = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          message: "ok",
        }),
        params({ id: fixtures.inTransitId }),
      );
      expect(shortMessage.status).toBe(400);
      expect((await readJson<ErrorBody>(shortMessage)).error.fields?.message).toBeDefined();

      const badType = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          type: "ABDUCTED",
        }),
        params({ id: fixtures.inTransitId }),
      );
      expect(badType.status).toBe(400);
    });

    it("returns 404 for a shipment that does not exist", async () => {
      const response = await addEvent(
        send("/api/staff/shipments/nope/events", "POST", VALID_EVENT),
        params({ id: "nope" }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("future-dated events", () => {
    it("rejects an event dated tomorrow", async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          occurredAt: tomorrow,
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(400);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.code).toBe("EVENT_IN_FUTURE");
    });

    it("accepts a timestamp a couple of minutes ahead, allowing for clock skew", async () => {
      const soon = new Date(Date.now() + 2 * 60_000).toISOString();

      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          occurredAt: soon,
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(201);
    });

    it("accepts a backdated event and sorts it into position", async () => {
      const longAgo = new Date(Date.now() - 200 * 3_600_000).toISOString();

      await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          occurredAt: longAgo,
          message: "A historical record added late.",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const body = await readJson<PublicTrackingResult>(
        await publicTrack(
          get("/api/shipments/TRK-TEST-001"),
          params({ trackingNumber: "TRK-TEST-001" }),
        ),
      );

      // Oldest, so it belongs at the end rather than presented as the latest.
      expect(body.events[body.events.length - 1]?.message).toBe(
        "A historical record added late.",
      );
    });
  });

  describe("optional status and location propagation", () => {
    it("leaves the shipment untouched when the option is off", async () => {
      const before = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          type: "OUT_FOR_DELIVERY",
          location: "Somewhere else entirely",
          updateShipment: false,
        }),
        params({ id: fixtures.inTransitId }),
      );

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      expect(after.status).toBe(before.status);
      expect(after.currentLocation).toBe(before.currentLocation);
    });

    it("updates status and location when the option is on", async () => {
      await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          type: "OUT_FOR_DELIVERY",
          location: "Westmoor Quay delivery depot",
          updateShipment: true,
        }),
        params({ id: fixtures.inTransitId }),
      );

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      expect(after.status).toBe("OUT_FOR_DELIVERY");
      expect(after.currentLocation).toBe("Westmoor Quay delivery depot");
    });

    it("lets a delivered event and the delivered status be applied together", async () => {
      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          location: "Westmoor Quay",
          type: "DELIVERED",
          message: "Delivered and signed for.",
          updateShipment: true,
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(201);

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });
      expect(after.status).toBe("DELIVERED");
    });
  });
});

describe("internal notes", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);
  });

  it("creates a note attributed to the signed-in staff member", async () => {
    const response = await addNote(
      send(`/api/staff/shipments/${fixtures.deliveredId}/notes`, "POST", {
        body: "Held for collection at the depot.",
      }),
      params({ id: fixtures.deliveredId }),
    );

    expect(response.status).toBe(201);

    const body = await readJson<{ note: { author: { id: string } } }>(response);
    expect(body.note.author.id).toBe(fixtures.staffId);
  });

  it("refuses to let a caller attribute a note to someone else", async () => {
    const response = await addNote(
      send(`/api/staff/shipments/${fixtures.deliveredId}/notes`, "POST", {
        body: "Attempting to forge authorship.",
        authorId: "some-other-user",
      }),
      params({ id: fixtures.deliveredId }),
    );

    // The unexpected key is rejected outright rather than silently ignored.
    expect(response.status).toBe(400);
  });

  it("rejects an empty note", async () => {
    const response = await addNote(
      send(`/api/staff/shipments/${fixtures.deliveredId}/notes`, "POST", { body: "   " }),
      params({ id: fixtures.deliveredId }),
    );

    expect(response.status).toBe(400);
  });

  it("shows notes to staff on the shipment detail", async () => {
    const detail = await readJson<StaffShipmentDetail>(
      await staffDetail(
        get(`/api/staff/shipments/${fixtures.inTransitId}`),
        params({ id: fixtures.inTransitId }),
      ),
    );

    expect(detail.notes.map((note) => note.body)).toContain(NOTE_CANARY);
  });
});
