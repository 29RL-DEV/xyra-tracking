import { beforeEach, describe, expect, it } from "vitest";
import { POST as submitEnquiry } from "@/app/api/enquiries/route";
import { GET as listEnquiries } from "@/app/api/staff/enquiries/route";
import { PATCH as patchEnquiry } from "@/app/api/staff/enquiries/[id]/route";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/db";
import type { StaffEnquiry } from "@/lib/dto/enquiry";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import {
  resetDatabase,
  seedFixtures,
  signIn,
  signOut,
  type Fixtures,
} from "../helpers/fixtures";

const VALID_ENQUIRY = {
  trackingNumber: "TRK-TEST-001",
  category: "DELIVERY_DELAY",
  message: "Could you confirm the delivery window for tomorrow, please?",
};

describe("customer enquiries", () => {
  let fixtures: Fixtures;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    resetRateLimits();
    signOut();
  });

  describe("submission", () => {
    it("accepts a valid enquiry without any authentication", async () => {
      const response = await submitEnquiry(
        send("/api/enquiries", "POST", VALID_ENQUIRY),
      );

      expect(response.status).toBe(201);

      const body = await readJson<{ enquiry: { id: string; status: string } }>(response);
      expect(body.enquiry.status).toBe("OPEN");
      expect(await prisma.enquiry.count()).toBe(3);
    });

    it("links the enquiry to the shipment it names", async () => {
      await submitEnquiry(send("/api/enquiries", "POST", VALID_ENQUIRY));

      const enquiry = await prisma.enquiry.findFirstOrThrow({
        where: { message: VALID_ENQUIRY.message },
      });

      expect(enquiry.shipmentId).toBe(fixtures.inTransitId);
      expect(enquiry.trackingNumber).toBe("TRK-TEST-001");
    });

    it("returns a receipt only, never shipment data", async () => {
      const response = await submitEnquiry(
        send("/api/enquiries", "POST", VALID_ENQUIRY),
      );

      const raw = JSON.stringify(await readJson<unknown>(response));

      expect(raw).not.toContain("Westmoor Quay");
      expect(raw).not.toContain("IN_TRANSIT");
      expect(raw).not.toContain("estimatedDelivery");
    });

    it("rejects an unknown tracking number with 404 and creates nothing", async () => {
      const before = await prisma.enquiry.count();

      const response = await submitEnquiry(
        send("/api/enquiries", "POST", {
          ...VALID_ENQUIRY,
          trackingNumber: "TRK-NOPE-999",
        }),
      );

      expect(response.status).toBe(404);
      const body = await readJson<ErrorBody>(response);
      expect(body.error.code).toBe("SHIPMENT_NOT_FOUND");
      expect(await prisma.enquiry.count()).toBe(before);
    });

    it("rejects a missing required field, naming which one", async () => {
      const noTrackingNumber = await submitEnquiry(
        send("/api/enquiries", "POST", {
          category: "OTHER",
          message: "A message with no tracking number attached to it.",
        }),
      );
      expect(noTrackingNumber.status).toBe(400);
      expect((await readJson<ErrorBody>(noTrackingNumber)).error.fields?.trackingNumber).toBeDefined();

      const noCategory = await submitEnquiry(
        send("/api/enquiries", "POST", {
          trackingNumber: "TRK-TEST-001",
          message: "A message with no category selected at all.",
        }),
      );
      expect(noCategory.status).toBe(400);
      expect((await readJson<ErrorBody>(noCategory)).error.fields?.category).toBeDefined();

      const tooShortMessage = await submitEnquiry(
        send("/api/enquiries", "POST", { ...VALID_ENQUIRY, message: "too short" }),
      );
      expect(tooShortMessage.status).toBe(400);
      expect((await readJson<ErrorBody>(tooShortMessage)).error.fields?.message).toBeDefined();
    });

    it("rejects an unknown category value", async () => {
      const response = await submitEnquiry(
        send("/api/enquiries", "POST", { ...VALID_ENQUIRY, category: "NONSENSE" }),
      );

      expect(response.status).toBe(400);
    });

    it("collapses an identical resubmission instead of creating a duplicate", async () => {
      const first = await submitEnquiry(send("/api/enquiries", "POST", VALID_ENQUIRY));
      const second = await submitEnquiry(send("/api/enquiries", "POST", VALID_ENQUIRY));

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);

      const a = await readJson<{ enquiry: { id: string } }>(first);
      const b = await readJson<{ enquiry: { id: string } }>(second);
      expect(b.enquiry.id).toBe(a.enquiry.id);

      expect(
        await prisma.enquiry.count({ where: { message: VALID_ENQUIRY.message } }),
      ).toBe(1);
    });

    it("collapses identical submissions that arrive at the same moment", async () => {
      // Guards the outcome under concurrent load: removing the duplicate check
      // would create six rows here. The advisory lock behind it (see
      // enquiryLockKey in the service) is what makes this reliable — without
      // it, a race between the check and the insert could let two identical
      // submissions both through.
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          submitEnquiry(send("/api/enquiries", "POST", VALID_ENQUIRY)),
        ),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 200, 201]);

      const ids = await Promise.all(
        responses.map(async (response) => {
          const body = await readJson<{ enquiry: { id: string } }>(response);
          return body.enquiry.id;
        }),
      );
      expect(new Set(ids).size).toBe(1);

      expect(
        await prisma.enquiry.count({ where: { message: VALID_ENQUIRY.message } }),
      ).toBe(1);
    });

    it("does not make different enquiries wait for or collapse into each other", async () => {
      const responses = await Promise.all(
        ["first", "second", "third"].map((word) =>
          submitEnquiry(
            send("/api/enquiries", "POST", {
              ...VALID_ENQUIRY,
              message: `A distinct ${word} question about the delivery window.`,
            }),
          ),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    });

    it("still creates a separate enquiry for a different shipment", async () => {
      await submitEnquiry(send("/api/enquiries", "POST", VALID_ENQUIRY));
      await submitEnquiry(
        send("/api/enquiries", "POST", {
          ...VALID_ENQUIRY,
          trackingNumber: "TRK-TEST-002",
        }),
      );

      expect(
        await prisma.enquiry.count({ where: { message: VALID_ENQUIRY.message } }),
      ).toBe(2);
    });

    it("rate limits a client that submits too many enquiries", async () => {
      const request = () =>
        submitEnquiry(
          new Request("http://localhost/api/enquiries", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": "203.0.113.7",
            },
            body: JSON.stringify({
              ...VALID_ENQUIRY,
              message: `Unique message ${Math.random()} for the rate limit test.`,
            }),
          }) as never,
        );

      for (let i = 0; i < 10; i += 1) {
        const response = await request();
        expect(response.status).toBe(201);
      }

      const limited = await request();
      expect(limited.status).toBe(429);

      const body = await readJson<ErrorBody>(limited);
      expect(body.error.code).toBe("RATE_LIMITED");
    });
  });

  describe("staff management", () => {
    beforeEach(async () => {
      await signIn(fixtures.staffId);
    });

    it("lists enquiries with the context needed to act on them", async () => {
      const response = await listEnquiries(get("/api/staff/enquiries"));
      expect(response.status).toBe(200);

      const body = await readJson<{ enquiries: StaffEnquiry[] }>(response);
      expect(body.enquiries).toHaveLength(2);

      const enquiry = body.enquiries[0]!;
      expect(enquiry.trackingNumber).toBeTruthy();
      expect(enquiry.category).toBeTruthy();
      expect(enquiry.message).toBeTruthy();
      expect(enquiry.createdAt).toBeTruthy();
      expect(enquiry.status).toBeTruthy();
      expect(enquiry.shipment?.status).toBeTruthy();
    });

    it("filters to open enquiries", async () => {
      const body = await readJson<{ enquiries: StaffEnquiry[] }>(
        await listEnquiries(get("/api/staff/enquiries?status=OPEN")),
      );

      expect(body.enquiries).toHaveLength(1);
      expect(body.enquiries[0]?.status).toBe("OPEN");
    });

    it("rejects an invalid status filter", async () => {
      const response = await listEnquiries(get("/api/staff/enquiries?status=PENDING"));
      expect(response.status).toBe(400);
    });

    it("resolves an enquiry and records who resolved it", async () => {
      const open = await prisma.enquiry.findFirstOrThrow({ where: { status: "OPEN" } });

      const response = await patchEnquiry(
        send(`/api/staff/enquiries/${open.id}`, "PATCH", { status: "RESOLVED" }),
        params({ id: open.id }),
      );

      expect(response.status).toBe(200);

      const body = await readJson<{ enquiry: StaffEnquiry }>(response);
      expect(body.enquiry.status).toBe("RESOLVED");
      expect(body.enquiry.resolvedAt).not.toBeNull();
      expect(body.enquiry.resolvedBy?.id).toBe(fixtures.staffId);
    });

    it("reopens an enquiry and clears the resolution", async () => {
      const resolved = await prisma.enquiry.findFirstOrThrow({
        where: { status: "RESOLVED" },
      });

      const body = await readJson<{ enquiry: StaffEnquiry }>(
        await patchEnquiry(
          send(`/api/staff/enquiries/${resolved.id}`, "PATCH", { status: "OPEN" }),
          params({ id: resolved.id }),
        ),
      );

      expect(body.enquiry.status).toBe("OPEN");
      expect(body.enquiry.resolvedAt).toBeNull();
      expect(body.enquiry.resolvedBy).toBeNull();
    });

    it("is harmless to resolve an enquiry twice", async () => {
      const open = await prisma.enquiry.findFirstOrThrow({ where: { status: "OPEN" } });

      const first = await patchEnquiry(
        send(`/api/staff/enquiries/${open.id}`, "PATCH", { status: "RESOLVED" }),
        params({ id: open.id }),
      );
      const second = await patchEnquiry(
        send(`/api/staff/enquiries/${open.id}`, "PATCH", { status: "RESOLVED" }),
        params({ id: open.id }),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it("returns 404 for an enquiry that does not exist", async () => {
      const response = await patchEnquiry(
        send("/api/staff/enquiries/nope", "PATCH", { status: "RESOLVED" }),
        params({ id: "nope" }),
      );

      expect(response.status).toBe(404);
    });

    it("rejects an invalid enquiry status", async () => {
      const open = await prisma.enquiry.findFirstOrThrow({ where: { status: "OPEN" } });

      const response = await patchEnquiry(
        send(`/api/staff/enquiries/${open.id}`, "PATCH", { status: "ARCHIVED" }),
        params({ id: open.id }),
      );

      expect(response.status).toBe(400);
    });

    it("never edits the customer's own message", async () => {
      const open = await prisma.enquiry.findFirstOrThrow({ where: { status: "OPEN" } });

      const response = await patchEnquiry(
        send(`/api/staff/enquiries/${open.id}`, "PATCH", {
          status: "RESOLVED",
          message: "Rewritten by staff",
        }),
        params({ id: open.id }),
      );

      expect(response.status).toBe(400);

      const after = await prisma.enquiry.findUniqueOrThrow({ where: { id: open.id } });
      expect(after.message).toBe(open.message);
    });
  });
});
