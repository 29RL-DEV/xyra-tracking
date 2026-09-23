import type { ShipmentStatus } from "@prisma/client";

/**
 * Public events carry only what a customer needs to read. The authoring staff
 * member, the internal identifiers and the insertion timestamp stay server-side.
 */
export interface PublicEvent {
  occurredAt: string;
  location: string;
  type: ShipmentStatus;
  message: string;
}

export interface StaffEvent extends PublicEvent {
  id: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface EventForPublic {
  occurredAt: Date;
  location: string;
  type: ShipmentStatus;
  message: string;
}

export interface EventForStaff extends EventForPublic {
  id: string;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
}

export function toPublicEvent(event: EventForPublic): PublicEvent {
  return {
    occurredAt: event.occurredAt.toISOString(),
    location: event.location,
    type: event.type,
    message: event.message,
  };
}

export function toStaffEvent(event: EventForStaff): StaffEvent {
  return {
    ...toPublicEvent(event),
    id: event.id,
    createdAt: event.createdAt.toISOString(),
    createdBy: event.createdBy
      ? { id: event.createdBy.id, name: event.createdBy.name }
      : null,
  };
}

export const PUBLIC_EVENT_KEYS = [
  "occurredAt",
  "location",
  "type",
  "message",
] as const;
