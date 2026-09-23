"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentStatus } from "@prisma/client";
import {
  CalendarClock,
  Eye,
  ExternalLink,
  History,
  MapPin,
  Pencil,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { ApiError, apiSend } from "@/lib/api-client";
import type { StaffShipmentDetail } from "@/lib/dto/shipment";
import {
  SERVICE_LEVEL_LABEL,
  SHIPMENT_STATUSES,
  SHIPMENT_TYPE_LABEL,
  STATUS_LABEL,
} from "@/lib/domain/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateOnly, DateTime } from "@/components/ui/date-time";
import { Field, Select } from "@/components/ui/field";
import { KeyFact, KeyFacts } from "@/components/ui/key-facts";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { useToast } from "@/components/ui/toast";
import { AddEventForm } from "./add-event-form";
import { ChangeHistory } from "./change-history";
import { InternalNotes } from "./internal-notes";
import { ShipmentEnquiries } from "./shipment-enquiries";

/**
 * The operational hub for one shipment.
 *
 * Customer-visible tracking events and staff-only notes live in separate,
 * explicitly labelled regions, so an operator always knows who will read what
 * they are typing.
 */
export function ShipmentDetailView({ detail }: { detail: StaffShipmentDetail }) {
  const { shipment, events, notes, enquiries, changes } = detail;
  const router = useRouter();
  const toast = useToast();

  /**
   * The server is the source of truth for the status.
   *
   * `pendingStatus` holds only a change that is in flight, so the control feels
   * responsive. It is cleared as soon as the refreshed server data arrives —
   * copying the status into state at mount would leave the badge showing a
   * stale value after an event updated the shipment underneath it.
   */
  const [pendingStatus, setPendingStatus] = useState<ShipmentStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const status = pendingStatus ?? shipment.status;

  useEffect(() => {
    setPendingStatus(null);
  }, [shipment.status, shipment.updatedAt]);

  const changeStatus = async (next: string) => {
    setPendingStatus(next as ShipmentStatus);
    setStatusError(null);
    setSavingStatus(true);

    try {
      await apiSend(`/api/staff/shipments/${shipment.id}`, "PATCH", {
        status: next,
      });
      toast.success(`Status changed to ${STATUS_LABEL[next as ShipmentStatus]}`);
      router.refresh();
    } catch (error) {
      // Fall back to the server's value rather than leaving the control showing
      // a change that was rejected.
      setPendingStatus(null);

      if (error instanceof ApiError) {
        setStatusError(error.message);
        toast.error("Status was not changed");
        return;
      }

      setStatusError("We could not change the status. Please try again.");
      toast.error("Status was not changed");
    } finally {
      setSavingStatus(false);
    }
  };

  const etaChanged =
    shipment.originalEstimatedDelivery !== null &&
    shipment.originalEstimatedDelivery !== shipment.estimatedDelivery;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Shipments", href: "/staff/shipments" }, { label: "Shipment detail" }]}
        title={shipment.trackingNumber}
        titleClassName="font-mono tracking-tight"
        meta={<StatusBadge status={status} size="md" />}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-ink">
              {shipment.origin.city}, {shipment.origin.country}
            </span>
            <span aria-hidden="true" className="text-ink-subtle">→</span>
            <span className="sr-only">to</span>
            <span className="font-medium text-ink">
              {shipment.destination.city}, {shipment.destination.country}
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink
              href={`/track/${shipment.trackingNumber}`}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Customer view
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href={`/staff/shipments/${shipment.id}/edit`}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit details
            </ButtonLink>
          </>
        }
      />

      {/* Key facts — one row under the header, not a grid of tiles */}
      <KeyFacts layout="grid" className="mb-12">
        <KeyFact label="Estimated delivery" icon={<CalendarClock className="h-4 w-4" />} emphasis>
          <DateOnly value={shipment.estimatedDelivery} />
          {etaChanged && shipment.originalEstimatedDelivery ? (
            <span className="mt-0.5 block text-sm font-medium text-amber-800">
              Originally <DateOnly value={shipment.originalEstimatedDelivery} />
            </span>
          ) : null}
        </KeyFact>
        <KeyFact label="Current location" icon={<MapPin className="h-4 w-4" />} emphasis>
          {shipment.currentLocation ?? "Not recorded"}
        </KeyFact>
        <KeyFact label="Service" icon={<Truck className="h-4 w-4" />} emphasis>
          {SERVICE_LEVEL_LABEL[shipment.serviceLevel] ?? shipment.serviceLevel}
          {shipment.shipmentType ? (
            <span className="font-normal text-ink-muted">
              {" "}· {SHIPMENT_TYPE_LABEL[shipment.shipmentType] ?? shipment.shipmentType}
            </span>
          ) : null}
        </KeyFact>
        <KeyFact label="Last updated" icon={<RefreshCcw className="h-4 w-4" />} emphasis>
          <DateTime value={shipment.updatedAt} />
        </KeyFact>
      </KeyFacts>

      <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-rows-[auto_1fr] xl:gap-x-12 xl:gap-y-10">
        {/* Status control — first in the source so a phone shows it above the history */}
        <div className="min-w-0 xl:col-start-2 xl:row-start-1">
          <Section titleId="status-heading" title="Status">
            <Field
              label="Change status"
              hint="The customer sees this change immediately."
              error={statusError ?? undefined}
            >
              <Select
                value={status}
                disabled={savingStatus}
                onChange={(event) => void changeStatus(event.target.value)}
              >
                {SHIPMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </Section>
        </div>

        {/* Customer-visible history */}
        <div className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Section
            titleId="events-heading"
            title="Tracking events"
            description="Append-only. Adding an event never changes or removes what is already here."
            actions={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Visible to the customer
              </span>
            }
          >
            <Card as="div" className="overflow-hidden">
              <div className="bg-canvas px-5 py-6 sm:px-6">
                <h3 className="text-base font-semibold text-ink">Add an event</h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Record something that has happened to this shipment.
                </p>
                <div className="mt-5">
                  <AddEventForm shipmentId={shipment.id} />
                </div>
              </div>

              <div className="px-5 py-7 sm:px-6">
                {events.length === 0 ? (
                  <EmptyState
                    bare
                    icon={<History className="h-5 w-5" aria-hidden="true" />}
                    title="No tracking events yet"
                    description="The customer currently sees an empty timeline for this shipment."
                  />
                ) : (
                  <Timeline
                    variant="structured"
                    latestLabel="Latest"
                    events={events.map((event) => ({
                      key: event.id,
                      occurredAt: event.occurredAt,
                      location: event.location,
                      type: event.type,
                      message: event.message,
                      meta: event.createdBy ? <span>Added by {event.createdBy.name}</span> : undefined,
                    }))}
                  />
                )}
              </div>
            </Card>
          </Section>
        </div>

        {/* Operator tools */}
        <div className="min-w-0 space-y-10 xl:col-start-2 xl:row-start-2">
          <Section titleId="details-heading" title="Shipment details">
            <Card as="div">
              <dl className="divide-y divide-line-strong/60 text-sm">
                <DetailRow label="Packages">{shipment.packageCount}</DetailRow>
                <DetailRow label="Weight">
                  {shipment.weightKg !== null ? `${shipment.weightKg} kg` : "—"}
                </DetailRow>
                <DetailRow label="Customer reference">
                  {shipment.customerReference ?? "—"}
                </DetailRow>
                <DetailRow label="Created">
                  <DateTime value={shipment.createdAt} />
                </DetailRow>
              </dl>
            </Card>
          </Section>

          <ShipmentEnquiries enquiries={enquiries} />

          <InternalNotes shipmentId={shipment.id} notes={notes} />

          <ChangeHistory changes={changes} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}
