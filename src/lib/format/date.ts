/**
 * Dates are stored and transmitted as UTC. Rendering happens in the viewer's
 * locale with an explicit timezone label, so a timeline is never ambiguous.
 */

/** UTC calendar date as YYYY-MM-DD, the shape used on the wire and in forms. */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "24 Sep 2026" */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * "24 Sep 2026, 15:03 GMT+1" — always absolute, never relative only.
 *
 * `timeZone` defaults to the viewer's own. Server rendering passes "UTC" so
 * the markup does not depend on where the server happens to run; see
 * components/ui/date-time.tsx.
 */
export function formatDateTime(value: string | Date, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** "15:03" in the given (or viewer) timezone. */
export function formatTime(value: string | Date, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** Whole calendar days from `earlier` to `later`, in the viewer's timezone. */
function calendarDaysBetween(earlier: Date, later: Date): number {
  const start = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const end = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  // Rounded, not floored: across a daylight-saving change a day is 23 or 25 hours.
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Shown alongside the absolute time, never instead of it.
 *
 * Anything older than an hour on an earlier date is described in calendar days,
 * so every time on one date gets the same phrase: two events on 21 September
 * both read "2 days ago" rather than "2 days" and "3 days" depending on the
 * hour. Within the same day, and for the last hour, it counts hours or minutes.
 */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const days = calendarDaysBetween(date, now);

  if (days === 0 || Math.abs(seconds) < 3600) {
    if (Math.abs(seconds) >= 3600) return formatter.format(-Math.round(seconds / 3600), "hour");
    if (Math.abs(seconds) >= 60) return formatter.format(-Math.round(seconds / 60), "minute");
    return "just now";
  }

  if (Math.abs(days) < 30) return formatter.format(-days, "day");
  if (Math.abs(days) < 365) return formatter.format(-Math.round(days / 30), "month");
  return formatter.format(-Math.round(days / 365), "year");
}

/** Value for a datetime-local input, in the viewer's own timezone. */
export function toLocalDateTimeInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
