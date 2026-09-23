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

/** Shown alongside the absolute time, never instead of it. */
export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

  for (const [unit, secondsPerUnit] of units) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return formatter.format(-Math.round(seconds / secondsPerUnit), unit);
    }
  }

  return "just now";
}

/** Value for a datetime-local input, in the viewer's own timezone. */
export function toLocalDateTimeInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
