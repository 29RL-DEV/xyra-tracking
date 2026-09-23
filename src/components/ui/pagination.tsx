"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

/**
 * Page controls for a bounded list.
 *
 * Shared by the shipment and enquiry lists so both read the same way and a
 * change to the pattern cannot apply to only one of them. The range summary is
 * always shown — an operator needs to know how much of the list they are
 * looking at even when it fits on one page.
 */
export function Pagination({
  page,
  total,
  pageSize,
  label,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  /** Names the navigation landmark, e.g. "Shipment pages". */
  label: string;
  onChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong/60 px-4 py-3.5 sm:px-6"
    >
      <p className="text-sm text-ink-muted">
        Showing{" "}
        <span className="font-semibold text-ink">
          {first}–{last}
        </span>{" "}
        of <span className="font-semibold text-ink">{total}</span>
      </p>

      {lastPage > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Button>
          <span className="text-sm tabular-nums text-ink-muted">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => onChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
