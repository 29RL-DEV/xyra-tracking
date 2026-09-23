import { Prisma, type ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { setTestCookie, clearTestCookies } from "../setup/test-env";

export const TEST_STAFF = {
  email: "tester@demo.test",
  name: "Test Operator",
  password: "TestPassword2026!",
};

export const NOTE_CANARY =
  "INTERNAL-ONLY-CANARY do not disclose to the customer";

export interface Fixtures {
  staffId: string;
  inTransitId: string;
  deliveredId: string;
  delayedId: string;
  exceptionId: string;
  emptyTimelineId: string;
}

function daysFromNow(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      days * 86_400_000,
  );
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

/** Empties every table, in foreign-key-safe order. */
export async function resetDatabase(): Promise<void> {
  await prisma.enquiry.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.trackingEvent.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.staffUser.deleteMany();
  clearTestCookies();
  // The limiter is module state shared by every test in the run, so sign-in
  // throttling from one case can never bleed into the next.
  resetRateLimits();
}

/**
 * A compact fixture covering the states the brief singles out, plus a shipment
 * with no events and a shipment carrying an internal note used as a canary by
 * the data-leakage tests.
 */
export async function seedFixtures(): Promise<Fixtures> {
  const staff = await prisma.staffUser.create({
    data: {
      email: TEST_STAFF.email,
      name: TEST_STAFF.name,
      passwordHash: await hashPassword(TEST_STAFF.password),
    },
  });

  const inTransit = await createShipment({
    trackingNumber: "TRK-TEST-001",
    status: "IN_TRANSIT",
    estimatedDelivery: daysFromNow(3),
    events: [
      { hoursAgo: 72, type: "COLLECTED", location: "Ashmarket depot", message: "Collected from the sender." },
      { hoursAgo: 24, type: "IN_TRANSIT", location: "Gralebridge hub", message: "In transit through the network." },
    ],
  });

  await prisma.internalNote.create({
    data: { shipmentId: inTransit, authorId: staff.id, body: NOTE_CANARY },
  });

  const delivered = await createShipment({
    trackingNumber: "TRK-TEST-002",
    status: "DELIVERED",
    estimatedDelivery: daysFromNow(-1),
    events: [
      { hoursAgo: 96, type: "COLLECTED", location: "Brindleford depot", message: "Collected from the sender." },
      { hoursAgo: 30, type: "DELIVERED", location: "Redhaven", message: "Delivered and signed for." },
    ],
  });

  const delayed = await createShipment({
    trackingNumber: "TRK-TEST-003",
    status: "DELAYED",
    estimatedDelivery: daysFromNow(4),
    originalEstimatedDelivery: daysFromNow(1),
    events: [
      { hoursAgo: 48, type: "IN_TRANSIT", location: "Calderwick", message: "In transit." },
      { hoursAgo: 6, type: "DELAYED", location: "Marsden Vale", message: "Delayed by a route closure. The estimated delivery date has moved." },
    ],
  });

  const exception = await createShipment({
    trackingNumber: "TRK-TEST-004",
    status: "EXCEPTION",
    estimatedDelivery: daysFromNow(2),
    events: [
      { hoursAgo: 5, type: "EXCEPTION", location: "Inglestead depot", message: "The delivery address is incomplete. We are holding the shipment." },
    ],
  });

  const emptyTimeline = await createShipment({
    trackingNumber: "TRK-TEST-005",
    status: "CREATED",
    estimatedDelivery: daysFromNow(6),
    events: [],
  });

  await prisma.enquiry.create({
    data: {
      shipmentId: delayed,
      trackingNumber: "TRK-TEST-003",
      category: "DELIVERY_DELAY",
      message: "Is there a new delivery date for this shipment yet?",
      status: "OPEN",
    },
  });

  await prisma.enquiry.create({
    data: {
      shipmentId: delivered,
      trackingNumber: "TRK-TEST-002",
      category: "OTHER",
      message: "Thank you, this arrived safely and on time.",
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById: staff.id,
    },
  });

  return {
    staffId: staff.id,
    inTransitId: inTransit,
    deliveredId: delivered,
    delayedId: delayed,
    exceptionId: exception,
    emptyTimelineId: emptyTimeline,
  };
}

async function createShipment(input: {
  trackingNumber: string;
  status: ShipmentStatus;
  estimatedDelivery: Date;
  originalEstimatedDelivery?: Date;
  events: Array<{
    hoursAgo: number;
    type: ShipmentStatus;
    location: string;
    message: string;
  }>;
}): Promise<string> {
  const shipment = await prisma.shipment.create({
    data: {
      trackingNumber: input.trackingNumber,
      status: input.status,
      originCity: "Ashmarket",
      originCountry: "United Kingdom",
      destinationCity: "Westmoor Quay",
      destinationCountry: "United Kingdom",
      estimatedDelivery: input.estimatedDelivery,
      ...(input.originalEstimatedDelivery
        ? { originalEstimatedDelivery: input.originalEstimatedDelivery }
        : {}),
      currentLocation: "Gralebridge hub",
      serviceLevel: "STANDARD",
      shipmentType: "PARCEL",
      packageCount: 2,
      weightKg: new Prisma.Decimal(4.5),
      customerReference: "REF-TEST-1",
    },
  });

  for (const event of input.events) {
    await prisma.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        occurredAt: hoursAgo(event.hoursAgo),
        location: event.location,
        type: event.type,
        message: event.message,
      },
    });
  }

  return shipment.id;
}

/** Puts a valid staff session in the request cookie jar. */
export async function signIn(staffId: string): Promise<void> {
  const token = await signSession({
    userId: staffId,
    email: TEST_STAFF.email,
    name: TEST_STAFF.name,
  });

  setTestCookie(SESSION_COOKIE, token);
}

export function signOut(): void {
  clearTestCookies();
}
