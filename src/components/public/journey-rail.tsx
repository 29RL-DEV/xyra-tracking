import type { ShipmentStatus } from "@prisma/client";
import { Check, MapPin } from "lucide-react";
import type { PublicEvent } from "@/lib/dto/event";
import type { PublicShipment } from "@/lib/dto/shipment";
import { isAttentionStatus, STATUS_TONE } from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { STATUS_ICON, TONE_STYLES } from "@/components/ui/status-badge";

const MILESTONES: Array<{ status: ShipmentStatus; label: string }> = [
  { status: "CREATED", label: "Created" },
  { status: "COLLECTED", label: "Collected" },
  { status: "IN_TRANSIT", label: "In transit" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
];

/** A delayed or held shipment has not been delivered, whatever its history holds. */
const LAST_UNDELIVERED_STEP = MILESTONES.findIndex(
  (milestone) => milestone.status === "OUT_FOR_DELIVERY",
);

/**
 * How far along the journey the shipment is. A delayed or held shipment is
 * placed at the furthest milestone its history shows, short of delivery, and
 * that step is drawn in the delay or exception treatment rather than as normal
 * progress.
 */
export function progressIndex(status: ShipmentStatus, events: PublicEvent[]): number {
  const direct = MILESTONES.findIndex((milestone) => milestone.status === status);
  if (direct !== -1) return direct;

  const reached = events
    .map((event) => MILESTONES.findIndex((milestone) => milestone.status === event.type))
    .filter((index) => index !== -1);

  return reached.length > 0 ? Math.min(Math.max(...reached), LAST_UNDELIVERED_STEP) : 0;
}

/**
 * The journey as one picture: where it started, the stages between, where it
 * is going, and where it is now.
 *
 * Each place is rendered once. From the sm breakpoint the two ends sit above a
 * horizontal rail; below it the same elements stack, and the rail turns
 * vertical so stage names are never squeezed into fifth-width columns.
 */
export function JourneyRail({
  shipment,
  events,
  currentLocation,
}: {
  shipment: PublicShipment;
  events: PublicEvent[];
  /** The shipment's recorded location, falling back to the latest event's. */
  currentLocation: string | null;
}) {
  const { status } = shipment;
  const current = progressIndex(status, events);
  const interrupted = isAttentionStatus(status);
  // progressIndex always returns a valid index; the fallback only satisfies the
  // type checker without asserting.
  const milestoneStatus = MILESTONES[current]?.status ?? "CREATED";
  const currentTone = TONE_STYLES[STATUS_TONE[interrupted ? status : milestoneStatus]];
  const CurrentIcon = interrupted ? STATUS_ICON[status] : STATUS_ICON[milestoneStatus];
  const delivered = status === "DELIVERED";

  return (
    <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6">
      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
        <p className="text-sm text-ink-subtle">From</p>
        <p className="mt-0.5 break-words text-lg font-semibold text-ink">{shipment.origin.city}</p>
        <p className="text-sm text-ink-muted">{shipment.origin.country}</p>
      </div>

      <ol
        aria-label="Delivery progress"
        className="relative sm:col-span-2 sm:row-start-2 sm:grid"
        // One column per milestone, so adding a step to MILESTONES cannot leave
        // the layout drawing the wrong number of columns.
        style={{ gridTemplateColumns: `repeat(${MILESTONES.length}, minmax(0, 1fr))` }}
      >
        {MILESTONES.map((milestone, index) => {
          const done = index < current || (index === current && delivered);
          const isCurrent = index === current && !delivered;
          const state = done ? "completed" : isCurrent ? "current" : "upcoming";
          const reached = index <= current;

          return (
            <li
              key={milestone.status}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex items-center gap-3 py-1.5 sm:flex-col sm:gap-0 sm:py-0 sm:text-center"
            >
              {index > 0 ? (
                <>
                  {/* Vertical connector up to the previous stage (narrow screens). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1/2 left-4 h-full -translate-x-1/2 sm:hidden",
                      reached ? "w-1 bg-brand-600" : "w-0.5 bg-line-strong",
                    )}
                  />
                  {/* Horizontal connector back to the previous stage (sm and up). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute right-1/2 top-4 hidden w-full -translate-y-1/2 sm:block",
                      reached ? "h-1 bg-brand-600" : "h-0.5 bg-line-strong",
                    )}
                  />
                </>
              ) : null}

              <span
                aria-hidden="true"
                className={cn(
                  "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  done && "bg-brand-700 text-white",
                  isCurrent && cn(currentTone.solid, "ring-4", currentTone.ring),
                  state === "upcoming" && "bg-white text-ink-subtle ring-2 ring-inset ring-line-strong",
                )}
              >
                {done ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : isCurrent ? (
                  <CurrentIcon className="h-4 w-4" strokeWidth={2.25} />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-line-strong" />
                )}
              </span>

              <span
                className={cn(
                  "text-sm sm:mt-2.5 sm:px-1",
                  state === "upcoming" ? "text-ink-subtle" : "font-semibold text-ink",
                  isCurrent && currentTone.text,
                )}
              >
                {milestone.label}
                <span className="sr-only">
                  {state === "completed" ? " (completed)" : state === "current" ? " (current step)" : " (not yet reached)"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {!delivered ? (
        <p className="flex items-start gap-2 text-sm text-ink-muted sm:col-span-2 sm:row-start-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          {currentLocation ? (
            <span>
              Now at <span className="font-semibold text-ink">{currentLocation}</span>
            </span>
          ) : (
            <span>Current location not yet recorded</span>
          )}
        </p>
      ) : null}

      <div className="min-w-0 sm:col-start-2 sm:row-start-1 sm:text-right">
        <p className="text-sm text-ink-subtle">To</p>
        <p className="mt-0.5 break-words text-lg font-semibold text-ink">{shipment.destination.city}</p>
        <p className="text-sm text-ink-muted">{shipment.destination.country}</p>
      </div>
    </div>
  );
}
