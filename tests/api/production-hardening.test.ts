import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as track } from "@/app/api/shipments/[trackingNumber]/route";
import { POST as createShipment } from "@/app/api/staff/shipments/route";
import { GET as getShipment, PATCH as patchShipment } from "@/app/api/staff/shipments/[id]/route";
import { POST as addEvent } from "@/app/api/staff/shipments/[id]/events/route";
import { GET as listShipments } from "@/app/api/staff/shipments/route";
import { DELETE as deleteEnquiry } from "@/app/api/staff/enquiries/[id]/route";
import { TRACKING_LOOKUP_RATE_LIMIT } from "@/lib/api/rate-limit";
import { handleRoute } from "@/lib/api/respond";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { enquiryReference } from "@/lib/domain/enquiry-reference";
import type { StaffShipment, StaffShipmentDetail } from "@/lib/dto/shipment";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import {
  resetDatabase,
  seedFixtures,
  signIn,
  TEST_STAFF,
  type Fixtures,
} from "../helpers/fixtures";
import { getTestCookie } from "../setup/test-env";

const BASE = "http://localhost:3000";

function lookup(trackingNumber: string, client: string) {
  return track(
    new NextRequest(new URL(`/api/shipments/${trackingNumber}`, BASE), {
      headers: { "x-forwarded-for": client },
    }),
    params({ trackingNumber }),
  );
}

async function detail(id: string): Promise<StaffShipmentDetail> {
  const response = await getShipment(get(`/api/staff/shipments/${id}`), params({ id }));
  expect(response.status).toBe(200);
  return readJson<StaffShipmentDetail>(response);
}

let fixtures: Fixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedFixtures();
});

describe("health endpoint", () => {
  it("reports the application and database as available, uncached", async () => {
    const response = await health();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });
});

describe("tracking lookup rate limit", () => {
  it("allows normal use, then refuses a client that keeps going", async () => {
    for (let i = 0; i < TRACKING_LOOKUP_RATE_LIMIT.limit; i += 1) {
      const response = await lookup("TRK-TEST-001", "203.0.113.7");
      expect(response.status).toBe(200);
    }

    const blocked = await lookup("TRK-TEST-001", "203.0.113.7");
    expect(blocked.status).toBe(429);
    expect((await readJson<ErrorBody>(blocked)).error.code).toBe("RATE_LIMITED");

    // Another client is unaffected.
    expect((await lookup("TRK-TEST-001", "198.51.100.4")).status).toBe(200);
  });

  it("counts lookups for unknown and malformed numbers too", async () => {
    for (let i = 0; i < TRACKING_LOOKUP_RATE_LIMIT.limit; i += 1) {
      await lookup(i % 2 === 0 ? "TRK-NOPE-999" : "bad!", "203.0.113.8");
    }

    expect((await lookup("TRK-TEST-001", "203.0.113.8")).status).toBe(429);
  });
});

describe("audit trail", () => {
  beforeEach(async () => {
    await signIn(fixtures.staffId);
  });

  it("records who created a shipment", async () => {
    const response = await createShipment(
      send("/api/staff/shipments", "POST", {
        originCity: "Pelforth",
        originCountry: "United Kingdom",
        destinationCity: "Redhaven",
        destinationCountry: "United Kingdom",
        estimatedDelivery: "2026-12-01",
        packageCount: 1,
      }),
    );
    const { shipment } = await readJson<{ shipment: StaffShipment }>(response);

    const { changes } = await detail(shipment.id);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      action: "CREATED",
      staff: { id: fixtures.staffId, name: TEST_STAFF.name },
    });
  });

  it("records a status change with its old and new value and the staff member", async () => {
    await patchShipment(
      send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", { status: "DELAYED" }),
      params({ id: fixtures.inTransitId }),
    );

    const { changes } = await detail(fixtures.inTransitId);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      action: "UPDATED",
      changes: { status: { from: "IN_TRANSIT", to: "DELAYED" } },
      staff: { name: TEST_STAFF.name },
    });
  });

  it("records only the fields that actually changed, and nothing for a no-op", async () => {
    const before = await detail(fixtures.inTransitId);

    await patchShipment(
      send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
        status: before.shipment.status,
        currentLocation: before.shipment.currentLocation,
      }),
      params({ id: fixtures.inTransitId }),
    );
    expect((await detail(fixtures.inTransitId)).changes).toHaveLength(0);

    await patchShipment(
      send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", {
        status: before.shipment.status,
        estimatedDelivery: "2026-12-24",
      }),
      params({ id: fixtures.inTransitId }),
    );

    const [entry] = (await detail(fixtures.inTransitId)).changes;
    expect(Object.keys(entry!.changes)).toEqual(["estimatedDelivery"]);
    expect(entry!.changes.estimatedDelivery!.to).toBe("2026-12-24");
  });

  it("records the status and location an applied event changed", async () => {
    await addEvent(
      send(`/api/staff/shipments/${fixtures.inTransitId}/events`, "POST", {
        type: "OUT_FOR_DELIVERY",
        location: "Redhaven delivery depot",
        message: "With the driver for delivery today.",
        updateShipment: true,
      }),
      params({ id: fixtures.inTransitId }),
    );

    const [entry] = (await detail(fixtures.inTransitId)).changes;
    expect(entry).toMatchObject({
      action: "EVENT_APPLIED",
      changes: {
        status: { from: "IN_TRANSIT", to: "OUT_FOR_DELIVERY" },
        currentLocation: { to: "Redhaven delivery depot" },
      },
      staff: { name: TEST_STAFF.name },
    });
  });

  it("never reaches the public tracking response", async () => {
    await patchShipment(
      send(`/api/staff/shipments/${fixtures.inTransitId}`, "PATCH", { status: "DELAYED" }),
      params({ id: fixtures.inTransitId }),
    );

    const response = await lookup("TRK-TEST-001", "192.0.2.1");
    const text = await response.text();

    expect(text).not.toContain(TEST_STAFF.name);
    expect(text).not.toContain("changes");
    expect(text).not.toContain("enquiries");
  });
});

describe("enquiries in shipment context", () => {
  beforeEach(async () => {
    await signIn(fixtures.staffId);
  });

  it("lists a shipment's enquiries on its staff detail, with the customer's reference", async () => {
    const enquiry = await prisma.enquiry.findFirstOrThrow({
      where: { shipmentId: fixtures.delayedId },
    });

    const { enquiries } = await detail(fixtures.delayedId);

    expect(enquiries.map((e) => e.id)).toContain(enquiry.id);
    expect(enquiries.find((e) => e.id === enquiry.id)!.reference).toBe(
      enquiryReference(enquiry.id),
    );
  });
});

describe("enquiry deletion", () => {
  beforeEach(async () => {
    await signIn(fixtures.staffId);
  });

  it("permanently removes an enquiry", async () => {
    const enquiry = await prisma.enquiry.findFirstOrThrow();

    const response = await deleteEnquiry(
      send(`/api/staff/enquiries/${enquiry.id}`, "DELETE"),
      params({ id: enquiry.id }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await prisma.enquiry.findUnique({ where: { id: enquiry.id } })).toBeNull();
  });
});

describe("sessions for accounts that no longer exist", () => {
  it("are refused, and the stale cookie is cleared", async () => {
    const leaver = await prisma.staffUser.create({
      data: { email: "leaver@demo.test", name: "Former Operator", passwordHash: "x" },
    });
    await signIn(leaver.id);
    await prisma.staffUser.delete({ where: { id: leaver.id } });

    const response = await listShipments(get("/api/staff/shipments"));

    expect(response.status).toBe(401);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("UNAUTHENTICATED");
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
  });
});

describe("unexpected-error logging", () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a generic 500 with an id that matches one structured log line", async () => {
    const failing = handleRoute(async (_request: NextRequest): Promise<NextResponse> => {
      throw new Error("disk on fire");
    });

    const response = await failing(get("/api/example"));
    const errorId = response.headers.get("x-error-id");

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("disk on fire");
    expect(errorId).toBeTruthy();

    expect(logged).toHaveLength(1);
    const entry = JSON.parse(logged[0]!);
    expect(entry).toMatchObject({
      level: "error",
      event: "api.unhandled_error",
      errorId,
      method: "GET",
      path: "/api/example",
      error: { name: "Error", message: "disk on fire" },
    });
  });

  it("leaves database error messages, which can quote customer text, out of the log", async () => {
    const failing = handleRoute(async (_request: NextRequest): Promise<NextResponse> => {
      const error = new Error('Invalid value for message: "CUSTOMER-TEXT-CANARY"');
      error.name = "PrismaClientValidationError";
      throw error;
    });

    await failing(get("/api/example"));

    expect(logged.join("\n")).not.toContain("CUSTOMER-TEXT-CANARY");
    expect(JSON.parse(logged[0]!).error.name).toBe("PrismaClientValidationError");
  });
});
