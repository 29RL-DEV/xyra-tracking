import { Prisma, type ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import {
  ATTENTION_STATUSES,
  NEEDS_ATTENTION_FILTER,
  STATUS_LABEL,
} from "@/lib/domain/status";
import { EVENT_ORDER_BY } from "@/lib/domain/ordering";
import {
  nextTrackingNumber,
  normaliseTrackingNumber,
  TRACKING_NUMBER_PREFIX,
} from "@/lib/domain/tracking-number";
import {
  toPublicShipment,
  toStaffNote,
  toStaffShipment,
  toStaffShipmentChange,
  toStaffShipmentEnquiry,
  toStaffShipmentListItem,
  type PublicTrackingResult,
  type StaffShipmentDetail,
  type StaffShipmentListItem,
} from "@/lib/dto/shipment";
import { toPublicEvent, toStaffEvent } from "@/lib/dto/event";
import { diffShipment, recordShipmentChange } from "./shipment-audit";
import { assertCanMoveTo } from "./status-transition";
import type {
  CreateShipmentInput,
  ShipmentQuery,
  UpdateShipmentInput,
} from "@/lib/validation/shipment";

export const PAGE_SIZE = 20;

/**
 * Ceilings on the collections loaded with a single shipment.
 *
 * History is append-only and never pruned, so both of these grow for the life
 * of a shipment. Reading the newest slice keeps one unusually busy shipment
 * from loading an unbounded number of rows into a page render; the ordering is
 * newest-first, so the cut falls on the oldest entries.
 */
export const EVENT_HISTORY_LIMIT = 200;
export const NOTE_HISTORY_LIMIT = 100;
export const DETAIL_ENQUIRY_LIMIT = 20;
export const CHANGE_HISTORY_LIMIT = 20;

/**
 * Explicit select lists. Internal notes are not merely filtered out of the
 * public path — they are never fetched, so they cannot be serialised by
 * accident at any depth.
 */
const publicShipmentSelect = {
  trackingNumber: true,
  status: true,
  originCity: true,
  originCountry: true,
  destinationCity: true,
  destinationCountry: true,
  estimatedDelivery: true,
  originalEstimatedDelivery: true,
  currentLocation: true,
  serviceLevel: true,
  shipmentType: true,
  packageCount: true,
  weightKg: true,
  customerReference: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShipmentSelect;

const staffShipmentSelect = {
  id: true,
  ...publicShipmentSelect,
} satisfies Prisma.ShipmentSelect;

const publicEventSelect = {
  occurredAt: true,
  location: true,
  type: true,
  message: true,
} satisfies Prisma.TrackingEventSelect;

/** Public tracking lookup. Case-insensitive, because customers retype labels. */
export async function getPublicShipment(
  rawTrackingNumber: string,
): Promise<PublicTrackingResult> {
  const trackingNumber = normaliseTrackingNumber(rawTrackingNumber);

  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber },
    select: {
      ...publicShipmentSelect,
      events: {
        select: publicEventSelect,
        orderBy: [...EVENT_ORDER_BY],
        take: EVENT_HISTORY_LIMIT,
      },
    },
  });

  if (!shipment) {
    throw errors.shipmentNotFound();
  }

  const { events, ...shipmentFields } = shipment;

  return {
    shipment: toPublicShipment(shipmentFields),
    events: events.map(toPublicEvent),
  };
}

export interface ShipmentListResult {
  shipments: StaffShipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listShipments(
  query: ShipmentQuery,
): Promise<ShipmentListResult> {
  const where: Prisma.ShipmentWhereInput = {};

  if (query.status === NEEDS_ATTENTION_FILTER) {
    where.status = { in: ATTENTION_STATUSES };
  } else if (query.status) {
    where.status = query.status;
  }

  if (query.q) {
    // Partial, case-insensitive: operators rarely have the full number to hand.
    // Bound as a parameter by the ORM, never concatenated into SQL.
    where.trackingNumber = { contains: query.q, mode: "insensitive" };
  }

  const page = Math.max(1, query.page);

  const [rows, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      select: staffShipmentSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.shipment.count({ where }),
  ]);

  return {
    shipments: rows.map(toStaffShipmentListItem),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * The only place internal notes are read. It performs no authorisation itself:
 * the staff API route calls requireStaff() first, and the staff pages that call
 * this directly call requireStaffPage() first.
 */
export async function getStaffShipmentDetail(
  id: string,
): Promise<StaffShipmentDetail> {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    select: {
      ...staffShipmentSelect,
      events: {
        orderBy: [...EVENT_ORDER_BY],
        take: EVENT_HISTORY_LIMIT,
        select: {
          id: true,
          occurredAt: true,
          location: true,
          type: true,
          message: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      notes: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: NOTE_HISTORY_LIMIT,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
      },
      enquiries: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: DETAIL_ENQUIRY_LIMIT,
        select: {
          id: true,
          category: true,
          message: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
      auditEntries: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CHANGE_HISTORY_LIMIT,
        select: {
          id: true,
          action: true,
          changes: true,
          createdAt: true,
          staffUser: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!shipment) {
    throw errors.shipmentNotFound();
  }

  const { events, notes, enquiries, auditEntries, ...shipmentFields } = shipment;

  return {
    shipment: toStaffShipment(shipmentFields),
    events: events.map(toStaffEvent),
    notes: notes.map(toStaffNote),
    enquiries: enquiries.map(toStaffShipmentEnquiry),
    changes: auditEntries.map(toStaffShipmentChange),
  };
}

export async function getShipmentIdByTrackingNumber(
  rawTrackingNumber: string,
): Promise<string | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber: normaliseTrackingNumber(rawTrackingNumber) },
    select: { id: true },
  });

  return shipment?.id ?? null;
}

/** The number after the highest TRK-DEMO- number already issued. */
async function allocateTrackingNumber(): Promise<string> {
  const issued = await prisma.shipment.findMany({
    where: { trackingNumber: { startsWith: TRACKING_NUMBER_PREFIX } },
    select: { trackingNumber: true },
  });

  return nextTrackingNumber(issued.map((shipment) => shipment.trackingNumber));
}

/**
 * `staffUserId` is who is creating it, recorded in the audit trail. It is
 * optional only so the service can be exercised on its own; every route
 * passes the signed-in staff member.
 */
export async function createShipment(input: CreateShipmentInput, staffUserId?: string) {
  if (input.trackingNumber) {
    // A supplied number that is already taken is an ordinary, expected outcome,
    // so it is answered without attempting the insert. Letting the insert fail
    // would log a database error for every such request and bury real failures.
    // The unique constraint still decides the race between two requests.
    const existing = await prisma.shipment.findUnique({
      where: { trackingNumber: input.trackingNumber },
      select: { id: true },
    });

    if (existing) {
      throw errors.trackingNumberTaken(input.trackingNumber);
    }

    try {
      return await insertShipment(input, input.trackingNumber, staffUserId);
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.trackingNumberTaken(input.trackingNumber);
      throw error;
    }
  }

  // Two shipments created at the same moment can be offered the same next
  // number; the unique constraint rejects the second, which then takes the one
  // after it.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await insertShipment(input, await allocateTrackingNumber(), staffUserId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw errors.internal();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function insertShipment(
  input: CreateShipmentInput,
  trackingNumber: string,
  staffUserId?: string,
) {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber,
      status: input.status,
      originCity: input.originCity,
      originCountry: input.originCountry,
      destinationCity: input.destinationCity,
      destinationCountry: input.destinationCountry,
      estimatedDelivery: input.estimatedDelivery,
      // A shipment with no stated location has not moved yet, so the origin
      // is the honest answer rather than an empty field.
      currentLocation: input.currentLocation ?? input.originCity,
      serviceLevel: input.serviceLevel,
      ...(input.shipmentType ? { shipmentType: input.shipmentType } : {}),
      packageCount: input.packageCount,
      ...(input.weightKg === undefined
        ? {}
        : { weightKg: new Prisma.Decimal(input.weightKg) }),
      ...(input.customerReference
        ? { customerReference: input.customerReference }
        : {}),
      // Nested, so the shipment and its first audit entry are one statement.
      auditEntries: {
        create: { action: "CREATED", staffUserId: staffUserId ?? null },
      },
      // Creation is the first step of the journey, so it opens the timeline the
      // customer sees, in the same statement as the shipment itself.
      events: {
        create: {
          occurredAt: new Date(),
          location: input.currentLocation ?? input.originCity,
          type: "CREATED",
          message: "Shipment details received. Awaiting collection.",
          createdById: staffUserId ?? null,
        },
      },
    },
    select: staffShipmentSelect,
  });

  return toStaffShipment(created);
}

/**
 * The subset of the client these guards need, so they can run either on their
 * own or inside a caller transaction.
 */
type DbClient = Pick<typeof prisma, "trackingEvent">;

async function hasDeliveredEvent(
  shipmentId: string,
  db: DbClient = prisma,
): Promise<boolean> {
  const count = await db.trackingEvent.count({
    where: { shipmentId, type: "DELIVERED" },
  });

  return count > 0;
}

/**
 * The brief requires that a delivered shipment has a believable delivered
 * event. Enforcing it here makes the inconsistent state unreachable through the
 * application rather than merely discouraged.
 */
export async function assertDeliveredHasEvent(
  shipmentId: string,
  nextStatus: ShipmentStatus,
  db: DbClient = prisma,
): Promise<void> {
  if (nextStatus !== "DELIVERED") return;
  if (await hasDeliveredEvent(shipmentId, db)) return;

  throw errors.deliveredRequiresEvent();
}

/**
 * Translates a validated partial update into the columns to write.
 *
 * A field that was not supplied is left out entirely, so it keeps its previous
 * value and is never nulled. Pure, so the write-once ETA rule can be reasoned
 * about without a database.
 */
function buildShipmentUpdate(
  input: UpdateShipmentInput,
  existing: { estimatedDelivery: Date; originalEstimatedDelivery: Date | null },
): Prisma.ShipmentUpdateInput {
  const data: Prisma.ShipmentUpdateInput = {};

  if (input.status !== undefined) data.status = input.status;
  if (input.originCity !== undefined) data.originCity = input.originCity;
  if (input.originCountry !== undefined) data.originCountry = input.originCountry;
  if (input.destinationCity !== undefined) data.destinationCity = input.destinationCity;
  if (input.destinationCountry !== undefined) {
    data.destinationCountry = input.destinationCountry;
  }
  if (input.currentLocation !== undefined) data.currentLocation = input.currentLocation;
  if (input.serviceLevel !== undefined) data.serviceLevel = input.serviceLevel;
  if (input.shipmentType !== undefined) data.shipmentType = input.shipmentType;
  if (input.packageCount !== undefined) data.packageCount = input.packageCount;
  if (input.customerReference !== undefined) {
    data.customerReference = input.customerReference;
  }
  if (input.weightKg !== undefined) {
    data.weightKg = new Prisma.Decimal(input.weightKg);
  }

  if (input.estimatedDelivery !== undefined) {
    const changed =
      input.estimatedDelivery.getTime() !== existing.estimatedDelivery.getTime();

    data.estimatedDelivery = input.estimatedDelivery;

    // Write-once: the customer keeps seeing the original promise, not the
    // previous revision, however many times the date moves.
    if (changed && existing.originalEstimatedDelivery === null) {
      data.originalEstimatedDelivery = existing.estimatedDelivery;
    }
  }

  return data;
}

/**
 * Applies a partial update.
 *
 * The read, the delivered-event guard and the write share one transaction, so a
 * rejected update writes nothing. It does not lock the row: at the default READ
 * COMMITTED isolation, two concurrent edits to one field resolve as last write
 * wins. Both decisions taken from the read tolerate that — concurrent writers
 * capture the same original ETA, and permission to mark a shipment delivered
 * cannot be invalidated afterwards, because events are never deleted.
 */
export async function updateShipment(
  id: string,
  input: UpdateShipmentInput,
  /** Who is making the change, for the audit trail. See createShipment. */
  staffUserId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.shipment.findUnique({
      where: { id },
      select: staffShipmentSelect,
    });

    if (!existing) {
      throw errors.shipmentNotFound();
    }

    if (input.status) {
      // Only a real change has to follow the journey. The staff screens change
      // status through events; this keeps the API under the same rules.
      if (input.status !== existing.status) {
        await assertCanMoveTo(tx, id, "status", existing.status, input.status);
      }
      await assertDeliveredHasEvent(id, input.status, tx);
    }

    const updated = await tx.shipment.update({
      where: { id },
      data: buildShipmentUpdate(input, existing),
      select: staffShipmentSelect,
    });

    await recordShipmentChange(tx, {
      shipmentId: id,
      action: "UPDATED",
      changes: diffShipment(existing, updated),
      staffUserId: staffUserId ?? null,
    });

    // A status change leaves a row in the timeline, so the customer's latest
    // update never contradicts the status above it. Skipped when the latest
    // event already says the same thing.
    if (input.status && input.status !== existing.status) {
      const latest = await tx.trackingEvent.findFirst({
        where: { shipmentId: id },
        orderBy: [...EVENT_ORDER_BY],
        select: { type: true },
      });

      if (latest?.type !== input.status) {
        await tx.trackingEvent.create({
          data: {
            shipmentId: id,
            occurredAt: new Date(),
            location: updated.currentLocation ?? updated.originCity,
            type: input.status,
            message: `Shipment status changed to ${STATUS_LABEL[input.status]}.`,
            createdById: staffUserId ?? null,
          },
        });
      }
    }

    return toStaffShipment(updated);
  });
}

export interface OperationsOverview {
  /** Every status, including those with no shipments, so the breakdown is complete. */
  countsByStatus: Record<ShipmentStatus, number>;
  total: number;
  /** Delayed or exception shipments, most recently updated first. */
  needsAttention: StaffShipmentListItem[];
  /** The most recently updated shipments of any status. */
  recentlyUpdated: StaffShipmentListItem[];
}

const ALL_STATUSES: ShipmentStatus[] = [
  "CREATED",
  "COLLECTED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELAYED",
  "EXCEPTION",
];

/**
 * The staff overview. Read-only, staff projection only, and built from counts
 * the database already holds — nothing is estimated or invented.
 */
export async function getOperationsOverview(): Promise<OperationsOverview> {
  const [grouped, needsAttention, recentlyUpdated] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.shipment.findMany({
      where: { status: { in: ATTENTION_STATUSES } },
      select: staffShipmentSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
    }),
    prisma.shipment.findMany({
      select: staffShipmentSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
    }),
  ]);

  const countsByStatus = Object.fromEntries(
    ALL_STATUSES.map((status) => [status, 0]),
  ) as Record<ShipmentStatus, number>;

  for (const row of grouped) {
    countsByStatus[row.status] = row._count._all;
  }

  const total = Object.values(countsByStatus).reduce((sum, count) => sum + count, 0);

  return {
    countsByStatus,
    total,
    needsAttention: needsAttention.map(toStaffShipmentListItem),
    recentlyUpdated: recentlyUpdated.map(toStaffShipmentListItem),
  };
}
