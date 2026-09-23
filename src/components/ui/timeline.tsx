import type { ReactNode } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { MapPin } from "lucide-react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { DateTime } from "./date-time";
import { STATUS_ICON, TONE_STYLES } from "./status-badge";

export interface TimelineEvent {
  key: string;
  occurredAt: string;
  location: string;
  type: ShipmentStatus;
  message: string;
  /** Extra metadata line, such as who recorded the event. Staff only. */
  meta?: ReactNode;
}

/**
 * The tracking history, shared by the customer page and the staff console so
 * the two can never present events differently.
 *
 * An ordered list with one item per event, newest first. The newest event is
 * marked in words ("Latest update"), not only by its larger coloured marker,
 * and every event states its type, message, location and time as separate,
 * labelled pieces rather than one run-on line.
 *
 * Only the newest event is drawn at full weight; earlier ones step back to a
 * small marker and regular text, so the eye lands on what happened last.
 *
 * "structured" is the customer page weighting: a crisper 1px rail, outlined
 * earlier markers, darker event titles, and timestamps ranked above locations.
 * Content and order are identical in both variants.
 */
export function Timeline({
  events,
  latestLabel = "Latest update",
  variant = "default",
}: {
  events: TimelineEvent[];
  latestLabel?: string;
  variant?: "default" | "structured";
}) {
  const structured = variant === "structured";

  return (
    <ol className="relative">
      {events.map((event, index) => {
        const isLatest = index === 0;
        const isLast = index === events.length - 1;
        const Icon = STATUS_ICON[event.type];
        const tone = TONE_STYLES[STATUS_TONE[event.type]];

        return (
          <li key={event.key} className="relative flex gap-4 pb-8 last:pb-0 sm:gap-5">
            {/* The rail runs through the centre of the 40px marker column. */}
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-0 left-5 top-10 -translate-x-1/2 rounded-full",
                  structured ? "w-px bg-line-strong" : "w-0.5 bg-line",
                )}
              />
            ) : null}

            <span aria-hidden="true" className="relative z-[1] flex w-10 shrink-0 justify-center">
              {isLatest ? (
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full ring-4",
                    tone.solid,
                    tone.ring,
                  )}
                >
                  <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                </span>
              ) : (
                <span
                  className={cn(
                    "mt-1 flex h-7 w-7 items-center justify-center rounded-full",
                    structured
                      ? "bg-white text-ink-muted ring-1 ring-line-strong"
                      : "bg-surface-sunken text-ink-subtle",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
              )}
            </span>

            <div className={cn("min-w-0 flex-1", isLatest ? "pt-0.5" : "pt-1")}>
              <div className="flex flex-col gap-x-4 gap-y-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {isLatest ? (
                    <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
                      {latestLabel}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "font-semibold",
                      isLatest ? cn("text-base", tone.text) : cn("text-sm", structured ? "text-ink" : "text-ink-muted"),
                    )}
                  >
                    {STATUS_LABEL[event.type]}
                  </span>
                </div>
                <DateTime
                  value={event.occurredAt}
                  withRelative
                  className={cn("shrink-0 text-sm tabular-nums", structured ? "text-ink-muted" : "text-ink-subtle")}
                />
              </div>

              <p
                className={cn(
                  "mt-1.5 leading-7",
                  isLatest ? "text-[1.0625rem] font-medium text-ink" : "text-[0.9375rem] text-ink",
                )}
              >
                {event.message}
              </p>

              <div
                className={cn(
                  "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm",
                  structured ? "text-ink-subtle" : "text-ink-muted",
                )}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
                  <span className="sr-only">Location: </span>
                  <span className="min-w-0 break-words">{event.location}</span>
                </span>
                {event.meta}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
