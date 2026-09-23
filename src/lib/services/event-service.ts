import { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import { toStaffEvent, type StaffEvent } from "@/lib/dto/event";
import type { AuditChanges } from "@/lib/dto/shipment";
import type { CreateEventInput } from "@/lib/validation/event";
import { recordShipmentChange } from "./shipment-audit";

/**
 * Tolerance for clock skew between an operator's browser and the server. A
 * tracking event asserts something that already happened, so anything beyond
 * this is rejected rather than allowed to sort above genuine latest events.
 */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const staffEventSelect = {
  id: true,
  occurredAt: true,
  location: true,
  type: true,
  message: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
};

export interface AddEventResult {
  event: StaffEvent;
  shipmentUpdated: boolean;
}

/**
 * Appends an event. This is the only write against tracking events anywhere in
 * the application: there is no update and no delete, which is what makes the
 * history append-only.
 *
 * When `updateShipment` is set, the event insert and the shipment update share
 * one transaction, so a failure can never leave the event recorded without the
 * status change it was meant to carry.
 */
export async function addEvent(
  shipmentId: string,
  input: CreateEventInput,
  staffUserId: string,
  now: Date = new Date(),
): Promise<AddEventResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true },
  });

  if (!shipment) {
    throw errors.shipmentNotFound();
  }

  const occurredAt = input.occurredAt ?? now;

  if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw errors.eventInFuture();
  }

  // No delivered guard is needed on this path: propagating a DELIVERED event
  // creates that event in the same transaction, so the shipment can never end
  // up delivered with nothing in the timeline to show for it.
  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.trackingEvent.create({
      data: {
        shipmentId,
        occurredAt,
        location: input.location,
        type: input.type,
        message: input.message,
        createdById: staffUserId,
      },
      select: staffEventSelect,
    });

    if (input.updateShipment) {
      // The values the event replaces, read in the same transaction, so the
      // audit trail records exactly what this event changed.
      const before = await tx.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        select: { status: true, currentLocation: true },
      });

      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: input.type, currentLocation: input.location },
      });

      const changes: AuditChanges = {};
      if (before.status !== input.type) {
        changes.status = { from: before.status, to: input.type };
      }
      if (before.currentLocation !== input.location) {
        changes.currentLocation = { from: before.currentLocation, to: input.location };
      }

      await recordShipmentChange(tx, {
        shipmentId,
        action: "EVENT_APPLIED",
        changes,
        staffUserId,
      });
    } else {
      // Touch updatedAt so the staff list surfaces recently worked shipments.
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { updatedAt: new Date() },
      });
    }

    return event;
  });

  return {
    event: toStaffEvent(created),
    shipmentUpdated: input.updateShipment,
  };
}
