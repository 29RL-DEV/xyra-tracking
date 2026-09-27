import type { Prisma } from "@prisma/client";
import { errors } from "@/lib/api/errors";

/**
 * Locks a shipment's row until the calling transaction ends, or throws not
 * found when there is no such shipment.
 *
 * Every write that decides something from a shipment's current state takes
 * this first: adding an event checks the journey against the status and the
 * latest event, and an edit records what it replaced. Without the lock, two
 * requests can read the same state at the same moment and both act on it: a
 * Delivered and an Exception event both accepted, or an event recorded after
 * delivery. With it, the second request waits here until the first commits,
 * then reads what the first left behind.
 */
export async function lockShipment(
  tx: Prisma.TransactionClient,
  shipmentId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "shipments" WHERE id = ${shipmentId} FOR UPDATE
  `;

  if (rows.length === 0) {
    throw errors.shipmentNotFound();
  }
}
