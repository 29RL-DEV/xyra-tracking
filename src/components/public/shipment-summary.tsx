import type { ReactNode } from "react";
import type { ShipmentStatus } from "@prisma/client";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  Radio,
  Scale,
  Tag,
  Truck,
} from "lucide-react";
import type { PublicEvent } from "@/lib/dto/event";
import type { PublicShipment } from "@/lib/dto/shipment";
import {
  SERVICE_LEVEL_LABEL,
  SHIPMENT_TYPE_LABEL,
  STATUS_DESCRIPTION,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { DateOnly, DateTime } from "@/components/ui/date-time";
import { KeyFact, KeyFacts } from "@/components/ui/key-facts";
import { StatusIcon, TONE_STYLES } from "@/components/ui/status-badge";
import { JourneyRail } from "./journey-rail";

/**
 * The answer to "Where is my shipment?", above everything else.
 *
 * One surface, read top to bottom: what state it is in and when it arrives
 * (the focal point), why — for the states that need explaining — then the
 * journey, then the details. Status is carried by an icon, a word and a
 * sentence, never colour alone. Each fact appears once: the tracking number,
 * the two ends of the route and each detail are rendered in exactly one place.
 */
export function ShipmentSummary({
  shipment,
  latestEvent,
  events,
}: {
  shipment: PublicShipment;
  latestEvent: PublicEvent | null;
  /** The full history, used only to place a delayed or held shipment on the journey. */
  events?: PublicEvent[];
}) {
  const etaChanged =
    shipment.originalEstimatedDelivery !== null &&
    shipment.originalEstimatedDelivery !== shipment.estimatedDelivery;

  const currentLocation = shipment.currentLocation ?? latestEvent?.location ?? null;
  const deliveredEvent =
    shipment.status === "DELIVERED" && latestEvent?.type === "DELIVERED" ? latestEvent : null;
  const tone = TONE_STYLES[STATUS_TONE[shipment.status]];

  return (
    <Card aria-labelledby="shipment-summary-heading" className="overflow-hidden">
      {/* Identity strip: which shipment this is, in the search area navy, so the
          primary card reads as the start of the result rather than one more box. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-brand-950 px-5 py-3.5 sm:px-8">
        <p className="text-sm text-brand-200">Tracking number</p>
        <h2
          id="shipment-summary-heading"
          className="break-all font-mono text-lg font-semibold tracking-tight text-white sm:text-xl"
        >
          {shipment.trackingNumber}
        </h2>
      </div>

      {/* Focal point: status and arrival, at the same weight so they read as a pair */}
      <div className="grid gap-6 px-5 py-6 sm:px-8 sm:py-7 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
        <div className="min-w-0">
          <div className="flex items-center gap-3.5">
            <StatusIcon status={shipment.status} size="lg" />
            <p className={cn("text-display-sm", tone.text)}>{STATUS_LABEL[shipment.status]}</p>
          </div>
          <p className="mt-2.5 max-w-xl text-base leading-7 text-ink-muted">
            {STATUS_DESCRIPTION[shipment.status]}
          </p>
        </div>

        <div className="min-w-0 md:min-w-[13rem] md:pt-0.5 md:text-right">
          <p className="flex items-center gap-1.5 text-sm text-ink-subtle md:justify-end">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {deliveredEvent ? "Delivered on" : "Estimated delivery"}
          </p>
          <p
            className={cn(
              "mt-1 font-bold tracking-tight text-ink",
              deliveredEvent ? "text-xl" : "text-display-sm",
            )}
          >
            {deliveredEvent ? (
              <DateTime value={deliveredEvent.occurredAt} />
            ) : (
              <DateOnly value={shipment.estimatedDelivery} />
            )}
          </p>
          {etaChanged && !deliveredEvent && shipment.originalEstimatedDelivery ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Updated from <DateOnly value={shipment.originalEstimatedDelivery} />
            </p>
          ) : null}
        </div>
      </div>

      <StatusBand shipment={shipment} latestEvent={latestEvent} etaChanged={etaChanged} />

      <div className="px-5 py-7 sm:px-8">
        <JourneyRail
          shipment={shipment}
          events={events ?? (latestEvent ? [latestEvent] : [])}
          currentLocation={currentLocation}
        />
      </div>

      <div className="bg-canvas px-5 py-6 sm:px-8">
        <KeyFacts>
          <KeyFact label="Service" icon={<Truck className="h-4 w-4" />}>
            {SERVICE_LEVEL_LABEL[shipment.serviceLevel] ?? shipment.serviceLevel}
          </KeyFact>
          <KeyFact label="Packages" icon={<Package className="h-4 w-4" />}>
            {shipment.packageCount === 1 ? "1 package" : `${shipment.packageCount} packages`}
          </KeyFact>
          {shipment.shipmentType ? (
            <KeyFact label="Shipment type" icon={<Package className="h-4 w-4" />}>
              {SHIPMENT_TYPE_LABEL[shipment.shipmentType] ?? shipment.shipmentType}
            </KeyFact>
          ) : null}
          {shipment.weightKg !== null ? (
            <KeyFact label="Weight" icon={<Scale className="h-4 w-4" />}>
              {shipment.weightKg} kg
            </KeyFact>
          ) : null}
          {shipment.customerReference ? (
            <KeyFact label="Reference" icon={<Tag className="h-4 w-4" />}>
              {shipment.customerReference}
            </KeyFact>
          ) : null}
        </KeyFacts>
      </div>
    </Card>
  );
}

/** Where and when the quoted update happened. */
function EventStamp({ event, className }: { event: PublicEvent; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", className)}>
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
        {event.location}
      </span>
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <Clock3 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
        <DateTime value={event.occurredAt} />
      </span>
    </p>
  );
}

const BAND_TONE = {
  success: { band: "bg-emerald-50", accent: "bg-emerald-600", title: "text-emerald-900", body: "text-emerald-900", meta: "text-emerald-800", icon: "text-emerald-700" },
  warning: { band: "bg-amber-50", accent: "bg-amber-500", title: "text-amber-950", body: "text-amber-950", meta: "text-amber-800", icon: "text-amber-700" },
  danger: { band: "bg-red-50", accent: "bg-red-600", title: "text-red-900", body: "text-red-950", meta: "text-red-800", icon: "text-red-700" },
  neutral: { band: "bg-surface-muted", accent: "bg-brand-600", title: "text-ink", body: "text-ink", meta: "text-ink-muted", icon: "text-brand-700" },
} as const;

/**
 * A full-width strip explaining the state, drawn as part of the surface
 * rather than as a box inside it.
 *
 * Delivered, delayed and held shipments are explained in words from the latest
 * event; anything else shows the latest update. The latest message therefore
 * appears once here and once in the history below — never twice on this card.
 */
function StatusBand({
  shipment,
  latestEvent,
  etaChanged,
}: {
  shipment: PublicShipment;
  latestEvent: PublicEvent | null;
  etaChanged: boolean;
}) {
  const content = bandContent(shipment, latestEvent, etaChanged);
  if (!content) return null;

  const tone = BAND_TONE[content.tone];
  const Icon = content.icon;

  return (
    <div className={cn("relative flex gap-4 px-5 py-5 sm:px-8", tone.band)}>
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", tone.accent)} />
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone.icon)} aria-hidden="true" />
      <div className="min-w-0">
        <p className={cn("font-semibold", tone.title)}>{content.title}</p>
        <div className={cn("mt-1 space-y-1.5 text-[0.9375rem] leading-7", tone.body)}>
          {content.body}
        </div>
        {content.event ? <EventStamp event={content.event} className={cn("mt-2", tone.meta)} /> : null}
      </div>
    </div>
  );
}

function bandContent(
  shipment: PublicShipment,
  latestEvent: PublicEvent | null,
  etaChanged: boolean,
): {
  tone: keyof typeof BAND_TONE;
  icon: typeof Radio;
  title: string;
  body: ReactNode;
  event: PublicEvent | null;
} | null {
  const status: ShipmentStatus = shipment.status;

  if (status === "DELIVERED") {
    const delivered = latestEvent?.type === "DELIVERED" ? latestEvent : null;
    return {
      tone: "success",
      icon: CheckCircle2,
      title: "This shipment has been delivered",
      body: delivered ? (
        <p>{delivered.message}</p>
      ) : (
        <p>Delivery is complete. The history below shows the full journey.</p>
      ),
      event: delivered,
    };
  }

  if (status === "DELAYED") {
    return {
      tone: "warning",
      icon: Clock3,
      title: "This shipment is delayed",
      body: (
        <>
          {etaChanged && shipment.originalEstimatedDelivery ? (
            <p>
              The estimated delivery date has changed from{" "}
              <DateOnly value={shipment.originalEstimatedDelivery} className="font-semibold" /> to{" "}
              <DateOnly value={shipment.estimatedDelivery} className="font-semibold" />.
            </p>
          ) : (
            <p>The estimated delivery date may change.</p>
          )}
          {latestEvent ? <p>{latestEvent.message}</p> : null}
        </>
      ),
      event: latestEvent,
    };
  }

  if (status === "EXCEPTION") {
    return {
      tone: "danger",
      icon: AlertTriangle,
      title: "This shipment needs attention",
      body: latestEvent ? (
        <p>{latestEvent.message}</p>
      ) : (
        <p>
          We are holding this shipment while an issue is resolved. Contact us using the enquiry
          form below.
        </p>
      ),
      event: latestEvent,
    };
  }

  if (!latestEvent) return null;

  return {
    tone: "neutral",
    icon: Radio,
    title: "Latest update",
    body: <p className="font-medium">{latestEvent.message}</p>,
    event: latestEvent,
  };
}
