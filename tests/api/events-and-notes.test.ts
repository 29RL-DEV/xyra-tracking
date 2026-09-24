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
      // Between the fixture's Collected (72h ago) and In transit (24h ago) events.
      const earlier = new Date(Date.now() - 48 * 3_600_000).toISOString();

      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          occurredAt: earlier,
          message: "A historical record added late.",
        }),
        params({ id: fixtures.inTransitId }),
      );
      expect(response.status).toBe(201);

      const body = await readJson<PublicTrackingResult>(
        await publicTrack(
          get("/api/shipments/TRK-TEST-001"),
          params({ trackingNumber: "TRK-TEST-001" }),
        ),
      );

      // Sorted by when it happened, so it sits between the two, not on top as
      // if it were the latest update.
      expect(body.events.map((event) => event.message)).toEqual([
        "In transit through the network.",
        "A historical record added late.",
        "Collected from the sender.",
      ]);
    });
  });

  describe("the latest event is the shipment's current state", () => {
    it("sets status and location from an event that becomes the latest update", async () => {
      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          type: "OUT_FOR_DELIVERY",
          location: "Westmoor Quay delivery depot",
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(201);
      expect((await readJson<{ shipmentUpdated: boolean }>(response)).shipmentUpdated).toBe(true);

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });

      expect(after.status).toBe("OUT_FOR_DELIVERY");
      expect(after.currentLocation).toBe("Westmoor Quay delivery depot");
    });

    it("keeps the public latest update and status in agreement", async () => {
      // The scenario a reviewer found: a delayed shipment given a newer event
      // must not keep saying "Delayed" above a latest update that says otherwise.
      await addEvent(
        send(`/api/staff/shipments/${fixtures.delayedId}/events`, "POST", {
          ...VALID_EVENT,
          location: "Marsden Vale sorting centre",
          message: "The route has reopened and the shipment is moving again.",
        }),
        params({ id: fixtures.delayedId }),
      );

      const body = await readJson<PublicTrackingResult>(
        await publicTrack(
          get("/api/shipments/TRK-TEST-003"),
          params({ trackingNumber: "TRK-TEST-003" }),
        ),
      );

      expect(body.events[0]?.type).toBe("IN_TRANSIT");
      expect(body.shipment.status).toBe("IN_TRANSIT");
    });

    it("leaves the shipment untouched when a back-dated event only fills in history", async () => {
      const before = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.delayedId },
      });

      // Between the fixture's In transit (48h ago) and Delayed (6h ago) events.
      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.delayedId}/events`, "POST", {
          ...VALID_EVENT,
          type: "IN_TRANSIT",
          location: "Calderwick hub",
          message: "Arrived at the Calderwick hub.",
          occurredAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        }),
        params({ id: fixtures.delayedId }),
      );

      expect(response.status).toBe(201);
      expect((await readJson<{ shipmentUpdated: boolean }>(response)).shipmentUpdated).toBe(false);

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.delayedId },
      });

      expect(after.status).toBe(before.status);
      expect(after.currentLocation).toBe(before.currentLocation);
    });

    it("sets the status on a shipment's first event", async () => {
      await addEvent(
        send(`/api/staff/shipments/${fixtures.emptyTimelineId}/events`, "POST", {
          ...VALID_EVENT,
          type: "COLLECTED",
          location: "Ashmarket depot",
          message: "Collected from the sender.",
          occurredAt: new Date(Date.now() - 500 * 3_600_000).toISOString(),
        }),
        params({ id: fixtures.emptyTimelineId }),
      );

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.emptyTimelineId },
      });
      expect(after.status).toBe("COLLECTED");
    });

    it("marks the shipment delivered with a delivered event that is the latest update", async () => {
      await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          location: "Westmoor Quay delivery depot",
          type: "OUT_FOR_DELIVERY",
          message: "With the driver for delivery today.",
        }),
        params({ id: fixtures.inTransitId }),
      );

      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          location: "Westmoor Quay",
          type: "DELIVERED",
          message: "Delivered and signed for.",
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(201);

      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.inTransitId },
      });
      expect(after.status).toBe("DELIVERED");
    });

    it("rejects a back-dated delivered event and writes nothing", async () => {
      const eventsBefore = await prisma.trackingEvent.count({
        where: { shipmentId: fixtures.delayedId },
      });

      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.delayedId}/events`, "POST", {
          location: "Thornbeck",
          type: "DELIVERED",
          message: "Delivered and signed for.",
          occurredAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        }),
        params({ id: fixtures.delayedId }),
      );

      expect(response.status).toBe(422);
      expect((await readJson<ErrorBody>(response)).error.code).toBe("DELIVERED_EVENT_NOT_LATEST");

      expect(
        await prisma.trackingEvent.count({ where: { shipmentId: fixtures.delayedId } }),
      ).toBe(eventsBefore);
      const after = await prisma.shipment.findUniqueOrThrow({
        where: { id: fixtures.delayedId },
      });
      expect(after.status).toBe("DELAYED");
    });

    it("no longer accepts a client-chosen propagation flag", async () => {
      const response = await addEvent(
        send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
          ...VALID_EVENT,
          updateShipment: false,
        }),
        params({ id: fixtures.inTransitId }),
      );

      expect(response.status).toBe(400);
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
