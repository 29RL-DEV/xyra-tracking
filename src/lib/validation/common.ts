import { z } from "zod";
import { TRACKING_NUMBER_PATTERN } from "@/lib/domain/tracking-number";

/**
 * A calendar date with no time component. Parsed at UTC midnight so a shipment
 * dated 24 September is the 24th regardless of the server's timezone.
 */
export const dateOnly = z
  .string({ required_error: "An estimated delivery date is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in the format YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "Enter a real date",
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time",
  })
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
 * bound cannot drift between them, and so no list can be asked for page zero
 * or a page expressed as something other than a whole number.
 */
export const pageNumber = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? 1 : Number(value)))
  .refine((value) => Number.isInteger(value) && value >= 1, {
    message: "Page must be a positive whole number",
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
