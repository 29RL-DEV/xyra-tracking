import type {
  EnquiryCategory,
  EnquiryStatus,
  Prisma,
  ServiceLevel,
  ShipmentAuditAction,
  ShipmentStatus,
  ShipmentType,
} from "@prisma/client";
import { enquiryReference } from "@/lib/domain/enquiry-reference";
import { toDateOnlyString } from "@/lib/format/date";
import type { PublicEvent, StaffEvent } from "./event";

/**
 * The serialisation boundary.
 *
 * `PublicShipment` is a separate declared type from `StaffShipment`. The mapper
 * below returns `PublicShipment` explicitly, so adding a field to the database
 * model does not expose it, and returning an internal note from here is a
 * compile error rather than a code-review question.
 *
 * The public projection deliberately omits the internal `id`: the customer's
 * handle on a shipment is its tracking number, and publishing an internal
 * identifier invites enumeration.
 */

export interface PublicShipment {
  trackingNumber: string;
  status: ShipmentStatus;
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  estimatedDelivery: string;
  originalEstimatedDelivery: string | null;
  currentLocation: string | null;
  serviceLevel: ServiceLevel;
  shipmentType: ShipmentType | null;
  packageCount: number;
  weightKg: number | null;
  customerReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTrackingResult {
  shipment: PublicShipment;
  events: PublicEvent[];
}

export interface StaffShipment extends PublicShipment {
  id: string;
}

export interface StaffShipmentDetail {
  shipment: StaffShipment;
  events: StaffEvent[];
  notes: StaffNote[];
  /** Customer enquiries raised against this shipment, newest first. */
  enquiries: StaffShipmentEnquiry[];
  /** Staff changes to the shipment's own fields, newest first. */
  changes: StaffShipmentChange[];
}

export type AuditValue = string | number | null;
export type AuditChanges = Record<string, { from: AuditValue; to: AuditValue }>;

export interface StaffShipmentChange {
  id: string;
  action: ShipmentAuditAction;
  changes: AuditChanges;
  createdAt: string;
  /** Null when the staff account has since been removed. */
  staff: { id: string; name: string } | null;
}

export interface StaffShipmentEnquiry {
  id: string;
  /** The reference the customer was shown on submitting it. */
  reference: string;
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface StaffNote {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

export interface StaffShipmentListItem {
  id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  estimatedDelivery: string;
  currentLocation: string | null;
  updatedAt: string;
}

/**
 * The narrowed input type. It has no `notes` member, so the public mapper
 * cannot read internal notes even if it is handed a fully loaded entity.
 */
export interface ShipmentForPublic {
  trackingNumber: string;
  status: ShipmentStatus;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  estimatedDelivery: Date;
  originalEstimatedDelivery: Date | null;
  currentLocation: string | null;
  serviceLevel: ServiceLevel;
  shipmentType: ShipmentType | null;
  packageCount: number;
  weightKg: { toString(): string } | null;
  customerReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentForStaff extends ShipmentForPublic {
  id: string;
}

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export function toPublicShipment(shipment: ShipmentForPublic): PublicShipment {
  return {
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    origin: { city: shipment.originCity, country: shipment.originCountry },
    destination: {
      city: shipment.destinationCity,
      country: shipment.destinationCountry,
    },
    estimatedDelivery: toDateOnlyString(shipment.estimatedDelivery),
    originalEstimatedDelivery: shipment.originalEstimatedDelivery
      ? toDateOnlyString(shipment.originalEstimatedDelivery)
      : null,
    currentLocation: shipment.currentLocation,
    serviceLevel: shipment.serviceLevel,
    shipmentType: shipment.shipmentType,
    packageCount: shipment.packageCount,
    weightKg: decimalToNumber(shipment.weightKg),
    customerReference: shipment.customerReference,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

export function toStaffShipment(shipment: ShipmentForStaff): StaffShipment {
  return { ...toPublicShipment(shipment), id: shipment.id };
}

export function toStaffShipmentListItem(
  shipment: ShipmentForStaff,
): StaffShipmentListItem {
  return {
    id: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    origin: { city: shipment.originCity, country: shipment.originCountry },
    destination: {
      city: shipment.destinationCity,
      country: shipment.destinationCountry,
    },
    estimatedDelivery: toDateOnlyString(shipment.estimatedDelivery),
    currentLocation: shipment.currentLocation,
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

export function toStaffNote(note: {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
}): StaffNote {
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    author: { id: note.author.id, name: note.author.name },
  };
}

function isAuditValue(value: unknown): value is AuditValue {
  return value === null || typeof value === "string" || typeof value === "number";
}

/** Reads a stored change set defensively: anything malformed is skipped, not thrown. */
function toAuditChanges(value: Prisma.JsonValue | null): AuditChanges {
  const changes: AuditChanges = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return changes;

  for (const [field, change] of Object.entries(value)) {
    if (change === null || typeof change !== "object" || Array.isArray(change)) continue;
    const { from, to } = change as Record<string, unknown>;
    if (isAuditValue(from) && isAuditValue(to)) {
      changes[field] = { from, to };
    }
  }

  return changes;
}

export function toStaffShipmentChange(entry: {
  id: string;
  action: ShipmentAuditAction;
  changes: Prisma.JsonValue | null;
  createdAt: Date;
  staffUser: { id: string; name: string } | null;
}): StaffShipmentChange {
  return {
    id: entry.id,
    action: entry.action,
    changes: toAuditChanges(entry.changes),
    createdAt: entry.createdAt.toISOString(),
    staff: entry.staffUser ? { id: entry.staffUser.id, name: entry.staffUser.name } : null,
  };
}

export function toStaffShipmentEnquiry(enquiry: {
  id: string;
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}): StaffShipmentEnquiry {
  return {
    id: enquiry.id,
    reference: enquiryReference(enquiry.id),
    category: enquiry.category,
    message: enquiry.message,
    status: enquiry.status,
    createdAt: enquiry.createdAt.toISOString(),
    resolvedAt: enquiry.resolvedAt?.toISOString() ?? null,
  };
}

/** Field allow-lists, asserted directly by the data-leakage tests. */
export const PUBLIC_SHIPMENT_KEYS = [
  "trackingNumber",
  "status",
  "origin",
  "destination",
  "estimatedDelivery",
  "originalEstimatedDelivery",
  "currentLocation",
  "serviceLevel",
  "shipmentType",
  "packageCount",
  "weightKg",
  "customerReference",
  "createdAt",
  "updatedAt",
] as const;
