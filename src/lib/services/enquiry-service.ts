import type { EnquiryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import { normaliseTrackingNumber } from "@/lib/domain/tracking-number";
import {
  toEnquiryReceipt,
  toStaffEnquiry,
  type EnquiryReceipt,
  type StaffEnquiry,
} from "@/lib/dto/enquiry";
import type { CreateEnquiryInput } from "@/lib/validation/enquiry";

/** Window in which an identical resubmission is treated as the same enquiry. */
export const DUPLICATE_WINDOW_MS = 60 * 1000;

const staffEnquirySelect = {
  id: true,
  trackingNumber: true,
  category: true,
  message: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolvedBy: { select: { id: true, name: true } },
  shipment: { select: { id: true, status: true, destinationCity: true } },
};

/**
 * The advisory-lock key for one submission. Identical submissions share a key
 * and therefore take turns; anything else gets a different key and never
 * waits. Exported so the test proving that serialisation uses the same key.
 */
export function enquiryLockKey(
  shipmentId: string,
  category: string,
  message: string,
): string {
  return `enquiry:${shipmentId}:${category}:${message}`;
}

export interface CreateEnquiryResult {
  enquiry: EnquiryReceipt;
  duplicate: boolean;
}

/**
 * Public, unauthenticated write.
 *
 * An enquiry must resolve to a real shipment: the staff view is required to
 * show the related tracking number, and an enquiry pointing at nothing gives
 * staff no way to act on it.
 */
export async function createEnquiry(
  input: CreateEnquiryInput,
  now: Date = new Date(),
): Promise<CreateEnquiryResult> {
  const trackingNumber = normaliseTrackingNumber(input.trackingNumber);

  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber },
    select: { id: true },
  });

  if (!shipment) {
    throw errors.shipmentNotFound();
  }

  // A double-click or an impatient retry should not create two records.
  //
  // The rule is a time window, which a unique constraint cannot express — and a
  // constraint on the text alone would stop a customer from ever sending the
  // same words again. Instead, identical submissions are serialised with a
  // transaction-scoped advisory lock: two requests racing with the same
  // shipment, category and message take turns, so the second always sees the
  // first. Different enquiries never wait on each other.
  return prisma.$transaction(async (tx) => {
    const lockKey = enquiryLockKey(shipment.id, input.category, input.message);
    // Parameterised by the tagged template; hashtext maps the key to the
    // integer the lock function takes. Released when the transaction ends.
    // The lock must precede the duplicate check, at the default READ COMMITTED
    // isolation, so the check starts after a competing submission has committed
    // and sees it. Under REPEATABLE READ the snapshot is taken at the first
    // statement, before the wait, and both requests would insert.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const recent = await tx.enquiry.findFirst({
      where: {
        shipmentId: shipment.id,
        category: input.category,
        message: input.message,
        createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (recent) {
      return { enquiry: toEnquiryReceipt(recent), duplicate: true };
    }

    const created = await tx.enquiry.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber,
        category: input.category,
        message: input.message,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return { enquiry: toEnquiryReceipt(created), duplicate: false };
  });
}

/** Enquiries per page in the staff queue. */
export const ENQUIRY_PAGE_SIZE = 20;

export interface EnquiryListResult {
  enquiries: StaffEnquiry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The staff queue, one page at a time.
 *
 * Enquiries arrive from an unauthenticated public form and are never deleted,
 * so this collection only grows. Reading it whole would work for a demo and
 * fail quietly in service, which is why the page is bounded here rather than
 * left to the caller.
 */
export async function listEnquiries(
  query: { status?: EnquiryStatus; page?: number } = {},
): Promise<EnquiryListResult> {
  const where = query.status ? { status: query.status } : {};
  const page = Math.max(1, query.page ?? 1);

  const [rows, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      // id breaks ties, so a row cannot appear on two pages or be skipped.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: staffEnquirySelect,
      skip: (page - 1) * ENQUIRY_PAGE_SIZE,
      take: ENQUIRY_PAGE_SIZE,
    }),
    prisma.enquiry.count({ where }),
  ]);

  return {
    enquiries: rows.map(toStaffEnquiry),
    total,
    page,
    pageSize: ENQUIRY_PAGE_SIZE,
  };
}

export async function setEnquiryStatus(
  id: string,
  status: EnquiryStatus,
  staffUserId: string,
): Promise<StaffEnquiry> {
  const existing = await prisma.enquiry.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw errors.enquiryNotFound();
  }

  const updated = await prisma.enquiry.update({
    where: { id },
    data:
      status === "RESOLVED"
        ? { status, resolvedAt: new Date(), resolvedById: staffUserId }
        : { status, resolvedAt: null, resolvedById: null },
    select: staffEnquirySelect,
  });

  return toStaffEnquiry(updated);
}

/**
 * Permanently removes an enquiry — for example when the person who sent it
 * asks for it to be deleted, or it contains personal details it should not.
 * Enquiries are the only customer-written data the application stores, so
 * this is its erasure mechanism. Nothing else references an enquiry.
 */
export async function deleteEnquiry(id: string): Promise<void> {
  const { count } = await prisma.enquiry.deleteMany({ where: { id } });

  if (count === 0) {
    throw errors.enquiryNotFound();
  }
}

/** How many enquiries are waiting for staff. Shown in the staff navigation. */
export async function countOpenEnquiries(): Promise<number> {
  return prisma.enquiry.count({ where: { status: "OPEN" } });
}
