import { createHash } from "node:crypto";
import { Prisma, type ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import { ATTENTION_STATUSES, NEEDS_ATTENTION_FILTER } from "@/lib/domain/status";
import { EVENT_ORDER_BY } from "@/lib/domain/ordering";
import { generateTrackingNumber, normaliseTrackingNumber } from "@/lib/domain/tracking-number";
import {
  toPublicShipment,
  toStaffNote,
  toStaffShipment,
  toStaffShipmentChange,
  toStaffShipmentEnquiry,
  toStaffShipmentListItem,
  type PublicTrackingResult,
  type StaffShipment,
  type StaffShipmentDetail,
  type StaffShipmentListItem,
} from "@/lib/dto/shipment";
import { toPublicEvent, toStaffEvent } from "@/lib/dto/event";
import { diffShipment, recordShipmentChange } from "./shipment-audit";
import { lockShipment } from "./shipment-lock";
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
    where.trackingNumber = { contains: escapeLikePattern(query.q), mode: "insensitive" };
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
 * `contains` becomes a LIKE pattern, in which `%` and `_` are wildcards and a
 * backslash escapes. Escaping all three makes the search match what was typed,
 * so `%` finds nothing rather than every shipment.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
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

/**
 * Two random numbers colliding is vanishingly unlikely at 80 bits, but it is
 * the unique constraint on the tracking number that rules a duplicate out. If
 * it ever rejects one, a fresh number is drawn.
 */
const TRACKING_NUMBER_ATTEMPTS = 3;

/**
 * `staffUserId` is who is creating it, recorded in the audit trail. It is
 * optional only so the service can be exercised on its own; every route
 * passes the signed-in staff member.
 *
 * The tracking number is always generated, never chosen: a number anyone could
 * pick is a number anyone could guess.
 */
export async function createShipment(input: CreateShipmentInput, staffUserId?: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await insertShipment(input, generateTrackingNumber(), staffUserId);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === TRACKING_NUMBER_ATTEMPTS) throw error;
    }
  }
}

/**
 * How long an Idempotency-Key is remembered: far longer than any retry of the
 * same request, by a person or by a client. After that the key is forgotten,
 * and sent again it creates a new shipment.
 */
export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotentCreateResult {
  shipment: StaffShipment;
  /** True when the key had already created this shipment and nothing new was written. */
  replayed: boolean;
}

/**
 * createShipment, made safe to retry. The first request with a key creates the
 * shipment; a repeat of it, however many times it is sent, is answered with
 * that same shipment instead of creating another.
 *
 * The key row and the shipment are written in one transaction, so neither can
 * exist without the other. Requests sent together with the same key all reach
 * the key's unique index: the first to get there inserts, and the others wait
 * on it until the first commits, then fail and roll back, shipment included.
 * Each then reads what the first stored. Only a request that passed validation
 * gets this far, so a rejected request never uses up its key.
 *
 * Keys belong to the staff member who sent them. The stored request hash is
 * what makes a repeat a repeat: the same key with different details is
 * refused, because answering with the earlier shipment would tell the caller
 * their new details had been saved.
 */
export async function createShipmentIdempotently(
  input: CreateShipmentInput,
  staffUserId: string,
  key: string,
): Promise<IdempotentCreateResult> {
  const requestHash = hashCreateInput(input);

  for (let attempt = 1; ; attempt += 1) {
    try {
      const shipment = await prisma.$transaction(async (tx) => {
        // Clearing expired keys whenever a key is stored keeps the table
        // bounded without a scheduled job. It also frees this key if it has
        // expired, so an expired key behaves exactly like a new one.
        await tx.shipmentCreationKey.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_KEY_TTL_MS) } },
        });

        // The shipment goes first because the key row points at it. A second
        // request with the same key therefore inserts a shipment of its own,
        // but only ever inside this transaction: it waits at the key, and its
        // shipment is rolled back with everything else.
        const created = await insertShipment(input, generateTrackingNumber(), staffUserId, tx);

        await tx.shipmentCreationKey.create({
          data: { staffUserId, key, requestHash, shipmentId: created.id },
          select: { id: true },
        });

        return created;
      });

      return { shipment, replayed: false };
    } catch (error) {
      if (isUniqueViolationOn(error, CREATION_KEY_UNIQUE)) {
        const stored = await prisma.shipmentCreationKey.findUnique({
          where: { staffUserId_key: { staffUserId, key } },
          select: { requestHash: true, shipment: { select: staffShipmentSelect } },
        });

        if (stored) {
          if (stored.requestHash !== requestHash) throw errors.idempotencyKeyReused();
          return { shipment: toStaffShipment(stored.shipment), replayed: true };
        }

        // The row went between the failure and the read: its shipment was
        // deleted, or the key expired and was cleared. Either way the key is
        // free again, so the create is simply tried again below.
      } else if (!isUniqueViolationOn(error, TRACKING_NUMBER_UNIQUE)) {
        throw error;
      }

      if (attempt === TRACKING_NUMBER_ATTEMPTS) throw error;
    }
  }
}

/**
 * A fingerprint of what a create asks for, to tell a repeat of a request from
 * a different request sent under the same key. It is taken from the validated
 * input, so details that validate to the same shipment count as the same
 * request: a weight of "4.5" or 4.5, a service level left to its default or
 * sent as that default, the fields in any order.
 */
function hashCreateInput(input: CreateShipmentInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

/**
 * JSON with every object's keys in sorted order, so equal values always give
 * the same text. Dates arrive here already as ISO strings: JSON.stringify
 * applies toJSON before the replacer sees a value.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_name, nested: unknown) => {
    if (nested === null || typeof nested !== "object" || Array.isArray(nested)) {
      return nested;
    }

    const record = nested as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((name) => [name, record[name]]));
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

interface UniqueConstraint {
  columns: string[];
  index: string;
}

const TRACKING_NUMBER_UNIQUE: UniqueConstraint = {
  columns: ["trackingNumber"],
  index: "shipments_trackingNumber_key",
};

const CREATION_KEY_UNIQUE: UniqueConstraint = {
  columns: ["staffUserId", "key"],
  index: "shipment_creation_keys_staffUserId_key_key",
};

/**
 * Whether a unique violation was on this particular constraint. A keyed create
 * can break two — a colliding tracking number is retried, a used key is
 * replayed — so which one failed decides what happens next. Prisma names it in
 * meta.target, usually as the columns and occasionally as the index name, so
 * both forms are recognised.
 */
function isUniqueViolationOn(error: unknown, constraint: UniqueConstraint): boolean {
  if (!isUniqueViolation(error)) return false;

  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;

  if (typeof target === "string") {
    return target === constraint.index;
  }

  if (!Array.isArray(target)) return false;

  const columns = target.map((column) => String(column).replace(/"/g, "")).sort();
  return columns.join(",") === [...constraint.columns].sort().join(",");
}

async function insertShipment(
  input: CreateShipmentInput,
  trackingNumber: string,
  staffUserId?: string,
  /** The transaction to write in, when the insert is part of a larger one. */
  db: Prisma.TransactionClient = prisma,
) {
  // The opening event is dated by the database's clock, the same one that
  // dates events recorded as happening now, so an event added a moment later
  // on an instance whose clock differs can never sort before it.
  const [{ now }] = await db.$queryRaw<[{ now: Date }]>`SELECT clock_timestamp() AS now`;

  const created = await db.shipment.create({
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
          occurredAt: now,
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
 * Applies a partial update to a shipment's own details.
 *
 * The status is not one of them: it only changes through tracking events,
 * which apply the journey rules and give the customer the reason.
 *
 * The read and the write share one transaction, which starts by locking the
 * shipment's row, the same lock an event takes. Concurrent edits therefore
 * apply one after the other: each audit entry records the value it actually
 * replaced, and the original ETA is captured from the first change only.
 */
export async function updateShipment(
  id: string,
  input: UpdateShipmentInput,
  /** Who is making the change, for the audit trail. See createShipment. */
  staffUserId?: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockShipment(tx, id);

    const existing = await tx.shipment.findUniqueOrThrow({
      where: { id },
      select: staffShipmentSelect,
    });

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
