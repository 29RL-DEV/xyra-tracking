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
  /** True when the event became the latest update and set the shipment's state. */
  shipmentUpdated: boolean;
}

/**
 * Appends an event. This is the only write against tracking events anywhere in
 * the application: there is no update and no delete, which is what makes the
 * history append-only.
 *
 * The latest event is the shipment's current state. An event dated at or after
 * every existing event becomes the latest update, so it also sets the
 * shipment's status and current location — the customer can never see a
 * "latest update" that contradicts the status above it. A back-dated event
 * fills in history only and leaves the shipment as it is, so recording
 * something that happened earlier can never drag the present state backwards.
 *
 * A delivered event must be the latest update: delivery is the end of the
 * journey, and a timeline that continues after it would contradict itself.
 *
 * The latest-event read, the insert and the shipment update share one
 * transaction, so the event is never recorded without the state it carries.
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

  // The shipment's delivered guard is satisfied here by construction: a
  // DELIVERED event that becomes the latest update is created in the same
  // transaction that marks the shipment delivered.
  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.trackingEvent.findFirst({
      where: { shipmentId },
      orderBy: [{ occurredAt: "desc" }],
      select: { occurredAt: true },
    });
    const becomesLatest = !latest || occurredAt.getTime() >= latest.occurredAt.getTime();

    if (input.type === "DELIVERED" && !becomesLatest) {
      throw errors.deliveredEventNotLatest();
    }

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

    if (becomesLatest) {
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

    return { event, becomesLatest };
  });

  return {
    event: toStaffEvent(result.event),
    shipmentUpdated: result.becomesLatest,
  };
}
