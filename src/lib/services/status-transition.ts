import type { ShipmentStatus } from "@prisma/client";
import type { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import { EVENT_ORDER_BY } from "@/lib/domain/ordering";
import { allowedNextStatuses, journeyStep, STATUS_LABEL } from "@/lib/domain/status";

type DbClient = Pick<typeof prisma, "trackingEvent">;

/**
 * Throws unless a shipment can move from `from` to `to`. The step it had reached
 * is read from its history, so that after a delay or a problem it can only carry
 * on from where it was.
 */
export async function assertCanMoveTo(
  db: DbClient,
  shipmentId: string,
  field: "type" | "status",
  from: ShipmentStatus,
  to: ShipmentStatus,
): Promise<void> {
  const events = await db.trackingEvent.findMany({
    where: { shipmentId, type: { notIn: ["DELAYED", "EXCEPTION"] } },
    orderBy: [...EVENT_ORDER_BY],
    select: { type: true },
    take: 1,
  });

  const allowed = allowedNextStatuses(from, journeyStep(events.map((event) => event.type)));
  if (allowed.includes(to)) return;

  throw errors.invalidStatusTransition(
    field,
    STATUS_LABEL[from],
    STATUS_LABEL[to],
    allowed.map((status) => STATUS_LABEL[status]),
  );
}
