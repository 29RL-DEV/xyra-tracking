import Link from "next/link";
import { CheckCircle2, CircleDot } from "lucide-react";
import type { StaffShipmentEnquiry } from "@/lib/dto/shipment";
import { ENQUIRY_CATEGORY_LABEL } from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { DateTime } from "@/components/ui/date-time";
import { Section } from "@/components/ui/section";

/**
 * The customer enquiries raised against one shipment, with the reference each
 * customer was given, so a reference quoted back to staff leads somewhere.
 * Resolving and deleting stay in the enquiries inbox.
 */
export function ShipmentEnquiries({ enquiries }: { enquiries: StaffShipmentEnquiry[] }) {
  return (
    <Section
      titleId="shipment-enquiries-heading"
      title="Enquiries about this shipment"
      actions={
        enquiries.length > 0 ? (
          <Link
            href="/staff/enquiries?status=ALL"
            className="rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            Open the inbox
          </Link>
        ) : null
      }
    >
      <Card as="div">
        {enquiries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">
            No customer has raised an enquiry about this shipment.
          </p>
        ) : (
          <ul className="divide-y divide-line-strong/60">
            {enquiries.map((enquiry) => {
              const open = enquiry.status === "OPEN";

              return (
                <li key={enquiry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink">
                      {ENQUIRY_CATEGORY_LABEL[enquiry.category] ?? enquiry.category}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                        open ? "bg-brand-100 text-brand-800" : "bg-emerald-100 text-emerald-800",
                      )}
                    >
                      {open ? (
                        <CircleDot className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      {open ? "Open" : "Resolved"}
                    </span>
                    <span className="font-mono text-xs text-ink-subtle">Ref {enquiry.reference}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                    {enquiry.message}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    Received <DateTime value={enquiry.createdAt} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Section>
  );
}
