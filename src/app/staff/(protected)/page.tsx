import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, Package, Plus } from "lucide-react";
import type { ShipmentStatus } from "@prisma/client";
import {
  ATTENTION_STATUSES,
  SHIPMENT_STATUSES,
  STATUS_LABEL,
} from "@/lib/domain/status";
import type { StaffShipmentListItem } from "@/lib/dto/shipment";
import { formatDate } from "@/lib/format/date";
import { cn } from "@/lib/cn";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { countOpenEnquiries } from "@/lib/services/enquiry-service";
import { getOperationsOverview } from "@/lib/services/shipment-service";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateOnly, RelativeTime } from "@/components/ui/date-time";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

/**
 * The operator's starting point: what is moving, what needs a person, and what
 * customers are waiting on. Every number is a count the database holds; there
 * are no estimates, trends or placeholder figures.
 *
 * Hierarchy rather than a grid of equal cards: the headline figures sit on the
 * page as type, the status mix is one bar, and the page's main content is the
 * list of shipments that need someone.
 */
export default async function StaffOverviewPage() {
  await requireStaffPage("/staff");

  const [overview, openEnquiries] = await Promise.all([
    getOperationsOverview(),
    countOpenEnquiries(),
  ]);

  const { countsByStatus, total } = overview;
  const delivered = countsByStatus.DELIVERED;
  const active = total - delivered;
  // Derived from the shared rule, so the headline figure, its breakdown and the
  // list below always agree about which statuses count.
  const attention = ATTENTION_STATUSES.reduce((sum, status) => sum + countsByStatus[status], 0);
  const attentionBreakdown = ATTENTION_STATUSES.map(
    (status) => `${countsByStatus[status]} ${STATUS_LABEL[status].toLowerCase()}`,
  ).join(", ");

  return (
    <div>
      <PageHeader
        size="compact"
        title="Operations overview"
        description={<>Where every shipment stands today, {formatDate(new Date())}.</>}
        actions={
          <>
            <ButtonLink href="/staff/shipments" variant="secondary">
              View all shipments
            </ButtonLink>
            <ButtonLink href="/staff/shipments/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New shipment
            </ButtonLink>
          </>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          title="No shipments yet"
          description="Once shipments are created they will be summarised here."
        />
      ) : (
        <div className="space-y-9">
          {/* Headline figures */}
          <section aria-label="Headline figures">
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                href="/staff/shipments"
                label="Active shipments"
                value={active}
                detail={`${total} in total, ${delivered} delivered`}
              />
              <Metric
                href="#attention-heading"
                label="Delayed or held"
                value={attention}
                detail={attentionBreakdown}
                tone={attention > 0 ? "danger" : "neutral"}
              />
              <Metric
                href="/staff/shipments?status=OUT_FOR_DELIVERY"
                label="Out for delivery"
                value={countsByStatus.OUT_FOR_DELIVERY}
                detail="On the final delivery route"
              />
              <Metric
                href="/staff/enquiries"
                label="Open enquiries"
                value={openEnquiries}
                detail={openEnquiries === 0 ? "Nothing waiting" : "Waiting for a response"}
                tone={openEnquiries > 0 ? "warning" : "neutral"}
              />
            </ul>
          </section>

          <StatusDistribution counts={countsByStatus} total={total} />

          <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <Section
              titleId="attention-heading"
              title="Delayed and held shipments"
              description="Delayed shipments and shipments held with an issue, most recently updated first."
            >
              <Card as="div">
                {overview.needsAttention.length === 0 ? (
                  <EmptyState
                    bare
                    icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                    title="Nothing is delayed or held"
                    description="No shipment is delayed or held with an issue right now."
                  />
                ) : (
                  <ul className="divide-y divide-line-strong/60">
                    {overview.needsAttention.map((shipment) => (
                      <AttentionRow key={shipment.id} shipment={shipment} />
                    ))}
                  </ul>
                )}
              </Card>
            </Section>

            <Section titleId="recent-heading" title="Recently updated" description="The latest changes across every shipment.">
              <Card as="div">
                <ul className="divide-y divide-line-strong/60">
                  {overview.recentlyUpdated.map((shipment) => (
                    <ActivityRow key={shipment.id} shipment={shipment} />
                  ))}
                </ul>
                <div className="border-t border-line-strong/60 px-5 py-3.5">
                  <Link
                    href="/staff/shipments"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                  >
                    Open the full shipment list
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  href,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <li className="min-w-0">
      {/* A compact control, not a tile: a faint surface and hairline that firm
          up on hover, and a chevron that says it leads somewhere. */}
      <Link
        href={href}
        className="group block h-full rounded-lg bg-surface/60 px-3.5 py-2 ring-1 ring-inset ring-line-strong/60 transition-colors hover:bg-surface hover:ring-line-strong"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-[0.8125rem] font-medium text-ink-muted group-hover:text-ink">
            {label}
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-ink-subtle transition-colors group-hover:text-brand-700"
            aria-hidden="true"
          />
        </span>
        <span
          className={cn(
            "block text-display-sm leading-7 tabular-nums",
            tone === "danger" && "text-red-700",
            tone === "warning" && "text-amber-700",
            tone === "neutral" && "text-ink",
          )}
        >
          {value}
        </span>
        <span className="block text-xs leading-4 text-ink-muted">{detail}</span>
      </Link>
    </li>
  );
}

/**
 * The status mix as one bar, with a legend that doubles as navigation to each
 * filtered list. The counts in the legend carry the information; the bar only
 * shows proportion, so it is hidden from assistive technology.
 */
/**
 * One distinct colour per status, for this breakdown only.
 *
 * The shared status-badge tone system groups Collected, In transit and Out
 * for delivery under one "progress" colour, which reads fine as a badge next
 * to a status word but made three of the seven bar segments indistinguishable
 * from each other here. Created, Delivered, Delayed and Needs attention keep
 * their existing shared colours, so this bar still agrees with every status
 * badge elsewhere on the page.
 */
const STATUS_BAR_COLOUR: Record<ShipmentStatus, string> = {
  CREATED: "bg-[#64748B]", // slate
  COLLECTED: "bg-[#06B6D4]", // cyan
  IN_TRANSIT: "bg-[#2563EB]", // blue
  OUT_FOR_DELIVERY: "bg-[#7C3AED]", // violet
  DELIVERED: "bg-[#16A34A]", // green
  DELAYED: "bg-[#EA580C]", // orange
  EXCEPTION: "bg-[#DC2626]", // red
};

// Same seven colours, as text utilities, for the status label beside each dot.
const STATUS_LABEL_COLOUR: Record<ShipmentStatus, string> = {
  CREATED: "text-[#64748B]",
  COLLECTED: "text-[#06B6D4]",
  IN_TRANSIT: "text-[#2563EB]",
  OUT_FOR_DELIVERY: "text-[#7C3AED]",
  DELIVERED: "text-[#16A34A]",
  DELAYED: "text-[#EA580C]",
  EXCEPTION: "text-[#DC2626]",
};

function StatusDistribution({
  counts,
  total,
}: {
  counts: Record<ShipmentStatus, number>;
  total: number;
}) {
  // Zero-count statuses take no space in the bar, so they take no column
  // below it either — the two stay in step by construction.
  const present = SHIPMENT_STATUSES.filter((status) => counts[status] > 0);
  // One shared column template, in parts proportional to each count, so the
  // bar and the row of labels beneath it are pixel-aligned: grid tracks (unlike
  // percentage-width flex items) divide the space that is left after gaps,
  // so this can never overflow however uneven the counts are.
  const columns = present.map((status) => `${counts[status]}fr`).join(" ");

  return (
    <Card aria-labelledby="breakdown-heading" className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="breakdown-heading" className="text-base font-semibold text-ink">
          Shipments by status
        </h2>
        <p className="text-sm text-ink-muted">{total} shipments in total</p>
      </div>

      <div
        aria-hidden="true"
        className="mt-3.5 grid h-3 gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
        style={{ gridTemplateColumns: columns }}
      >
        {present.map((status) => (
          <span key={status} className={cn("h-full", STATUS_BAR_COLOUR[status])} />
        ))}
      </div>

      {/* Purely informational: no link, no navigation, no interactive
          affordance. Filtering by status happens on the shipment list itself
          (its own Status control), not from this breakdown.
          From sm upward each column takes the bar's own proportional width,
          so a label sits directly under the segment it describes. Below sm,
          an even grid instead — a status with 2 of 24 shipments would be an
          unreadably thin sliver at phone width. */}
      <ul
        className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-3 sm:gap-x-0.5 sm:gap-y-0 sm:[grid-template-columns:var(--status-columns)]"
        style={{ "--status-columns": columns } as React.CSSProperties}
      >
        {present.map((status) => (
          <li key={status} className="min-w-0 px-0.5 text-center">
            <p className="text-sm font-semibold tabular-nums text-ink">
              {counts[status]}
              <span className="sr-only"> {STATUS_LABEL[status].toLowerCase()} shipments</span>
            </p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5 text-xs leading-tight text-ink-muted">
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_BAR_COLOUR[status])}
              />
              <span className={cn("break-words", STATUS_LABEL_COLOUR[status])}>
                {STATUS_LABEL[status]}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AttentionRow({ shipment }: { shipment: StaffShipmentListItem }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <Link
          href={`/staff/shipments/${shipment.id}`}
          className="font-mono text-[0.9375rem] font-semibold text-brand-800 hover:underline"
        >
          {shipment.trackingNumber}
        </Link>
        <p className="mt-0.5 break-words font-medium text-ink">
          {shipment.origin.city} <span aria-hidden="true" className="text-ink-subtle">→</span>
          <span className="sr-only">to</span> {shipment.destination.city}
        </p>
        {shipment.currentLocation ? (
          <p className="mt-0.5 break-words text-sm text-ink-muted">Now at {shipment.currentLocation}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1.5 text-right">
        <StatusBadge status={shipment.status} />
        <span className="text-sm text-ink-muted">
          ETA <DateOnly value={shipment.estimatedDelivery} className="font-semibold text-ink" />
        </span>
        <RelativeTime value={shipment.updatedAt} className="text-xs text-ink-subtle" />
      </div>
    </li>
  );
}

function ActivityRow({ shipment }: { shipment: StaffShipmentListItem }) {
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/staff/shipments/${shipment.id}`}
          className="font-mono text-sm font-semibold text-brand-800 hover:underline"
        >
          {shipment.trackingNumber}
        </Link>
        <StatusBadge status={shipment.status} />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-ink-muted">
          {shipment.origin.city} <span aria-hidden="true">→</span>
          <span className="sr-only">to</span> {shipment.destination.city}
        </span>
        <RelativeTime value={shipment.updatedAt} className="shrink-0 text-xs text-ink-subtle" />
      </div>
    </li>
  );
}
