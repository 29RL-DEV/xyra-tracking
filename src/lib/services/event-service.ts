import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  allowedNextStatuses,
  journeyStep,
  SHIPMENT_STATUSES,
  STATUS_LABEL,
} from "@/lib/domain/status";
import { errors } from "@/lib/api/errors";
import { toStaffEvent, type StaffEvent } from "@/lib/dto/event";
import type { AuditChanges } from "@/lib/dto/shipment";
import type { CreateEventInput } from "@/lib/validation/event";
import { recordShipmentChange } from "./shipment-audit";
import { lockShipment } from "./shipment-lock";

/**
 * Tolerance for clock skew between an operator's browser and the database,
 * whose clock is what "now" means for every event (see addEvent). A tracking
 * event asserts something that already happened, so anything beyond this is
 * rejected. A time within it is recorded as the present moment: kept as sent,
 * it would sort above every event recorded over the next few minutes, and a
 * delivery added in that window would be refused as not the latest.
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
 * Every event, latest or back-dated, must leave the whole history a valid
 * journey. A back-dated event is checked in place together with every event
 * after it, because it can change the step those events carried on from.
 *
 * A delivered event must be the latest update: delivery is the end of the
 * journey, and a timeline that continues after it would contradict itself.
 * This is also the only place a shipment becomes delivered, in the same
 * transaction that records its delivered event, so one never exists without
 * the other.
 *
 * The checks, the insert and the shipment update share one transaction, which
 * starts by locking the shipment's row. Two events sent at the same moment are
 * therefore checked one after the other, the second against the state the
 * first left, and the event is never recorded without the state it carries.
 */
export async function addEvent(
  shipmentId: string,
  input: CreateEventInput,
  staffUserId: string,
): Promise<AddEventResult> {
  const result = await prisma.$transaction(async (tx) => {
    await lockShipment(tx, shipmentId);

    // The present, by the database's clock, read once the lock is held. It
    // dates an event recorded as happening now, limits how far ahead a given
    // time may be, and breaks a tie on the time. Every instance of the
    // application reads this one clock, so events recorded as happening now are
    // dated in the order they are applied, however far the clock of the
    // instance applying them has drifted. clock_timestamp() is the moment of
    // the call; now() would be when the transaction began, before the wait for
    // the lock.
    const [{ now }] = await tx.$queryRaw<[{ now: Date }]>`SELECT clock_timestamp() AS now`;
    const occurredAt = eventTime(input.occurredAt, now);

    // The values the event may replace, read under the lock, so the checks and
    // the audit trail both see exactly the state this event changes.
    const before = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { status: true, currentLocation: true },
    });

    const history = await tx.trackingEvent.findMany({
      where: { shipmentId },
      orderBy: EVENT_ORDER_OLDEST_FIRST,
      select: { type: true, occurredAt: true },
    });

    // The event sorts after every event dated at or before it, one with exactly
    // the same time included, since it is recorded after them.
    const position = history.filter((event) => event.occurredAt <= occurredAt).length;
    const becomesLatest = position === history.length;

    if (input.type === "DELIVERED" && !becomesLatest) {
      throw errors.deliveredEventNotLatest();
    }

    if (position === 0 && history.length > 0) {
      throw errors.eventOutOfOrder(
        "occurredAt",
        "An earlier event cannot be dated before the shipment's first event.",
      );
    }

    // The history as it would stand with the event in place. Nothing is written
    // unless all of it, from the event onwards, is a valid journey.
    const types = history.map((event) => event.type);
    const withEvent = (type: ShipmentStatus) => [
      ...types.slice(0, position),
      type,
      ...types.slice(position),
    ];

    if (firstInvalidStep(withEvent(input.type), position, before.status) !== -1) {
      const fitting = SHIPMENT_STATUSES.filter(
        (type) => firstInvalidStep(withEvent(type), position, before.status) === -1,
      );
      const labels = fitting.map((type) => STATUS_LABEL[type]);

      if (becomesLatest) {
        const previous = position === 0 ? before.status : types[position - 1]!;
        throw errors.invalidStatusTransition(
          "type",
          STATUS_LABEL[previous],
          STATUS_LABEL[input.type],
          labels,
        );
      }

      throw errors.eventOutOfOrder(
        "type",
        fitting.length === 0
          ? `The history cannot take a "${STATUS_LABEL[input.type]}" event at that time.`
          : `A "${STATUS_LABEL[input.type]}" event does not fit at that time. There it can be: ${labels.join(", ")}.`,
      );
    }

    const event = await tx.trackingEvent.create({
      data: {
        shipmentId,
        occurredAt,
        location: input.location,
        type: input.type,
        message: input.message,
        createdById: staffUserId,
        // The time read under the lock rather than the column's default, so an
        // event with the same time as an earlier one sorts after it, where it
        // was checked.
        createdAt: now,
      },
      select: staffEventSelect,
    });

    // A tie on the time is broken by when events were recorded. Confirm the
    // stored order is the one checked above; if clocks disagree, refuse rather
    // than keep a history nobody validated.
    if (history.some((existing) => existing.occurredAt.getTime() === occurredAt.getTime())) {
      const stored = await tx.trackingEvent.findMany({
        where: { shipmentId },
        orderBy: EVENT_ORDER_OLDEST_FIRST,
        select: { id: true },
      });

      if (stored[position]?.id !== event.id) {
        throw errors.eventOutOfOrder(
          "occurredAt",
          "Another event has exactly this time. Choose a slightly different time.",
        );
      }
    }

    if (becomesLatest) {
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

/** EVENT_ORDER_BY reversed: the order in which a journey is read. */
const EVENT_ORDER_OLDEST_FIRST = [
  { occurredAt: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

/**
 * The index of the first step in `types` (oldest first), from `from` onwards,
 * that the journey rules do not allow, or -1 when every one is allowed. Steps
 * before `from` are not checked: an event inserted at `from` cannot change
 * them. `start` is the status of a shipment that has no events yet.
 */
function firstInvalidStep(
  types: readonly ShipmentStatus[],
  from: number,
  start: ShipmentStatus,
): number {
  for (let index = from; index < types.length; index += 1) {
    const previous = index === 0 ? start : types[index - 1]!;
    const step = journeyStep(types.slice(0, index).reverse());

    if (!allowedNextStatuses(previous, step).includes(types[index]!)) {
      return index;
    }
  }

  return -1;
}

/**
 * When an event happened: the time the operator gave, or now when they gave
 * none. `now` is the database's clock, read under the shipment's lock. A time
 * slightly ahead of it is recorded as now, and one further ahead is refused.
 * See FUTURE_TOLERANCE_MS.
 */
function eventTime(requested: Date | undefined, now: Date): Date {
  if (!requested) return now;

  if (requested.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw errors.eventInFuture();
  }

  return requested.getTime() > now.getTime() ? now : requested;
}
