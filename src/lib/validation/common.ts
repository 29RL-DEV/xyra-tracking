import { z } from "zod";
import { TRACKING_NUMBER_PATTERN } from "@/lib/domain/tracking-number";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Whether a year, month and day name a day that exists, from year 1 on.
 * Date.parse does not answer this: it quietly rolls 30 February over into
 * March, and year 0 into 1 BC.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lastDay = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1]!;

  return day <= lastDay;
}

/**
 * A calendar date with no time component. Parsed at UTC midnight so a shipment
 * dated 24 September is the 24th regardless of the server's timezone.
 */
export const dateOnly = z
  .string({ required_error: "An estimated delivery date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in the format YYYY-MM-DD")
  .refine(
    (value) => {
      const [year, month, day] = value.split("-").map(Number);
      return isRealDate(year!, month!, day!);
    },
    { message: "Enter a real date" },
  )
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

/** An ISO 8601 date and time with an explicit offset, as toISOString() writes it. */
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const isoDateTime = z
  .string()
  .refine(
    (value) => {
      const match = ISO_DATE_TIME.exec(value);
      if (!match) return false;

      const [, year, month, day, hour, minute, second = "0"] = match;
      return (
        isRealDate(Number(year), Number(month), Number(day)) &&
        Number(hour) <= 23 &&
        Number(minute) <= 59 &&
        Number(second) <= 59 &&
        !Number.isNaN(Date.parse(value))
      );
    },
    { message: "Enter a valid date and time" },
  )
  .transform((value) => new Date(value));

export const trackingNumberInput = z
  .string()
  .trim()
  .min(1, "Enter a tracking number")
  .transform((value) => value.toUpperCase())
  .refine((value) => TRACKING_NUMBER_PATTERN.test(value), {
    message:
      "That does not look like a tracking number. They look like TRK-DEMO-001.",
  });

/**
 * A page number from a query string.
 *
 * Absent or empty means the first page. Shared by every paginated list so the
 * bound cannot drift between them, and so no list can be asked for page zero,
 * a page expressed as something other than a whole number, or a page so far
 * out that its offset overflows the database query.
 */
export const MAX_PAGE = 10_000;

export const pageNumber = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? 1 : Number(value)))
  .refine((value) => Number.isInteger(value) && value >= 1 && value <= MAX_PAGE, {
    message: `Page must be a whole number from 1 to ${MAX_PAGE}`,
  });

/** Trimmed text with a friendly message on both bounds, and when absent. */
export function text(field: string, min: number, max: number) {
  return z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be text`,
    })
    .trim()
    .min(min, min === 1 ? `${field} is required` : `${field} must be at least ${min} characters`)
    .max(max, `${field} must be ${max} characters or fewer`);
}

/** Optional text that treats an empty string as "not supplied". */
export function optionalText(field: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${field} must be ${max} characters or fewer`)
    .optional()
    .transform((value) => (value === "" ? undefined : value));
}
