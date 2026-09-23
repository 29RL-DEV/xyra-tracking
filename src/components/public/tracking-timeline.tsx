import { Clock } from "lucide-react";
import type { PublicEvent } from "@/lib/dto/event";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Timeline } from "@/components/ui/timeline";

/**
 * The journey so far.
 *
 * An ordered list, newest first, so assistive technology conveys the sequence.
 * It is never a table: a table cannot be read on a narrow screen without
 * horizontal scrolling, which the brief rules out.
 *
 * The heading sits in a header strip inside the panel, so the history reads as
 * one operational log rather than a title floating above another white card.
 */
export function TrackingTimeline({ events }: { events: PublicEvent[] }) {
  return (
    <section aria-labelledby="timeline-heading" className="min-w-0">
      <Card as="div" className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line-strong/70 bg-canvas px-5 py-3.5 sm:px-8">
          <h2 id="timeline-heading" className="text-[1.0625rem] font-semibold text-ink">
            Tracking history
          </h2>
          <p className="text-sm text-ink-muted">
            {events.length === 0
              ? "Every step of the journey will appear here."
              : `${events.length === 1 ? "1 update" : `${events.length} updates`}, newest first`}
          </p>
        </div>

        <div className="px-5 py-6 sm:px-8">
          {events.length === 0 ? (
            <EmptyState
              bare
              icon={<Clock className="h-5 w-5" aria-hidden="true" />}
              title="No tracking updates yet"
              description="Updates appear here once the shipment has been collected and starts moving through our network. Check back shortly."
            />
          ) : (
            <Timeline
              variant="structured"
              events={events.map((event, index) => ({
                key: `${event.occurredAt}-${index}`,
                occurredAt: event.occurredAt,
                location: event.location,
                type: event.type,
                message: event.message,
              }))}
            />
          )}
        </div>
      </Card>
    </section>
  );
}
