"use client";

import { useEffect, useState } from "react";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format/date";

/**
 * Timestamps that render identically on the server and in the browser.
 *
 * A page rendered on a server in UTC and hydrated in a browser in London would
 * otherwise produce two different strings for the same instant — a hydration
 * mismatch. The first render therefore uses UTC (labelled as such), and the
 * component switches to the viewer's own timezone once it has mounted.
 * Relative phrases ("3 hours ago") depend on the current time, so they only
 * appear after mounting.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

export function DateTime({
  value,
  withRelative = false,
  className,
}: {
  value: string;
  withRelative?: boolean;
  className?: string;
}) {
  const mounted = useMounted();

  return (
    <time dateTime={value} className={className}>
      {formatDateTime(value, mounted ? undefined : "UTC")}
      {withRelative && mounted ? (
        <span className="text-ink-subtle"> ({formatRelative(value)})</span>
      ) : null}
    </time>
  );
}

/** Relative-only phrase, for dense lists where the absolute time is secondary. */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const mounted = useMounted();

  return (
    <time dateTime={value} className={className}>
      {mounted ? formatRelative(value) : formatDateTime(value, "UTC")}
    </time>
  );
}

/** Calendar dates are timezone-free (stored at UTC midnight), so no switching. */
export function DateOnly({ value, className }: { value: string; className?: string }) {
  return (
    <time dateTime={value} className={className}>
      {formatDate(value)}
    </time>
  );
}
