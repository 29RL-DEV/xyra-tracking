import type { ShipmentStatus } from "@prisma/client";
import type { AuditValue, StaffShipmentChange } from "@/lib/dto/shipment";
import {
  SERVICE_LEVEL_LABEL,
  SHIPMENT_TYPE_LABEL,
  STATUS_LABEL,
} from "@/lib/domain/status";
import { formatDate } from "@/lib/format/date";
import { Card } from "@/components/ui/card";
import { DateTime } from "@/components/ui/date-time";
import { Section } from "@/components/ui/section";
import { StaffBadge } from "@/components/ui/staff-badge";

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  originCity: "Origin city",
  originCountry: "Origin country",
  destinationCity: "Destination city",
  destinationCountry: "Destination country",
  estimatedDelivery: "Estimated delivery",
  currentLocation: "Current location",
  serviceLevel: "Service",
  shipmentType: "Shipment type",
  packageCount: "Packages",
  weightKg: "Weight",
  customerReference: "Customer reference",
};

function formatValue(field: string, value: AuditValue): string {
  if (value === null || value === "") return "—";

  switch (field) {
    case "status":
      return STATUS_LABEL[value as ShipmentStatus] ?? String(value);
    case "serviceLevel":
      return SERVICE_LEVEL_LABEL[String(value)] ?? String(value);
    case "shipmentType":
      return SHIPMENT_TYPE_LABEL[String(value)] ?? String(value);
    case "estimatedDelivery":
      return formatDate(String(value));
    case "weightKg":
      return `${value} kg`;
    default:
      return String(value);
  }
}

function describe(change: StaffShipmentChange): string {
  const fields = Object.keys(change.changes);

  switch (change.action) {
    case "CREATED":
      return "Shipment created";
    case "EVENT_APPLIED":
      return "Updated by a tracking event";
    default:
      return fields.length === 1 && fields[0] === "status" ? "Status changed" : "Details edited";
  }
}

/**
 * Who changed the shipment's own fields, and how — newest first. Tracking
 * events and internal notes carry their own authors, so they are not repeated.
 */
export function ChangeHistory({ changes }: { changes: StaffShipmentChange[] }) {
  return (
    <Section titleId="history-heading" title="Change history">
      <Card as="div">
        {changes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">
            No changes recorded yet. Edits and status changes made here will be listed with who
            made them.
          </p>
        ) : (
          <ol className="divide-y divide-line-strong/60">
            {changes.map((change) => (
              <li key={change.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-ink">{describe(change)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
                  {change.staff ? (
                    <StaffBadge name={change.staff.name} />
                  ) : (
                    <span>A removed staff account</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <DateTime value={change.createdAt} />
                </p>
                {Object.keys(change.changes).length > 0 ? (
                  <dl className="mt-2 space-y-1 text-sm">
                    {Object.entries(change.changes).map(([field, { from, to }]) => (
                      <div key={field} className="flex flex-wrap gap-x-1.5">
                        <dt className="text-ink-muted">{FIELD_LABEL[field] ?? field}:</dt>
                        <dd className="min-w-0 break-words text-ink">
                          {formatValue(field, from)}
                          <span aria-hidden="true" className="px-1 text-ink-subtle">
                            →
                          </span>
                          <span className="sr-only"> changed to </span>
                          {formatValue(field, to)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Section>
  );
}
