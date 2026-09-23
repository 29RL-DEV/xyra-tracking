import type { Prisma, ShipmentAuditAction } from "@prisma/client";
import type { AuditChanges, AuditValue, ShipmentForStaff } from "@/lib/dto/shipment";
import { toDateOnlyString } from "@/lib/format/date";

/**
 * The audit trail for a shipment's own fields.
 *
 * Deliberately small: which staff member changed which fields of which
 * shipment, when, and from what to what. Tracking events and internal notes
 * already record their authors, so they are not duplicated here.
 */

type AuditableShipment = Omit<ShipmentForStaff, "createdAt" | "updatedAt" | "originalEstimatedDelivery">;

/**
 * The fields an operator can change, as the plain values the staff API already
 * serialises. `originalEstimatedDelivery` is left out on purpose: it is
 * derived from an ETA change, which is itself recorded.
 */
const AUDITED_FIELDS: Record<string, (shipment: AuditableShipment) => AuditValue> = {
  status: (s) => s.status,
  originCity: (s) => s.originCity,
  originCountry: (s) => s.originCountry,
  destinationCity: (s) => s.destinationCity,
  destinationCountry: (s) => s.destinationCountry,
  estimatedDelivery: (s) => toDateOnlyString(s.estimatedDelivery),
  currentLocation: (s) => s.currentLocation,
  serviceLevel: (s) => s.serviceLevel,
  shipmentType: (s) => s.shipmentType,
  packageCount: (s) => s.packageCount,
  weightKg: (s) => (s.weightKg === null ? null : Number(s.weightKg.toString())),
  customerReference: (s) => s.customerReference,
};

/** Every audited field whose value differs between the two versions. */
export function diffShipment(before: AuditableShipment, after: AuditableShipment): AuditChanges {
  const changes: AuditChanges = {};

  for (const [field, read] of Object.entries(AUDITED_FIELDS)) {
    const from = read(before);
    const to = read(after);
    if (from !== to) {
      changes[field] = { from, to };
    }
  }

  return changes;
}

/**
 * Writes one entry, using the caller's transaction so the entry and the change
 * it describes are committed together or not at all. An update that changed
 * nothing records nothing.
 */
export async function recordShipmentChange(
  db: Pick<Prisma.TransactionClient, "shipmentAuditEntry">,
  entry: {
    shipmentId: string;
    action: Exclude<ShipmentAuditAction, "CREATED">;
    changes: AuditChanges;
    staffUserId: string | null;
  },
): Promise<void> {
  if (Object.keys(entry.changes).length === 0) return;

  await db.shipmentAuditEntry.create({
    data: {
      shipmentId: entry.shipmentId,
      action: entry.action,
      changes: entry.changes,
      staffUserId: entry.staffUserId,
    },
  });
}
