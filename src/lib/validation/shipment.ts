import { z } from "zod";
import {
  NEEDS_ATTENTION_FILTER,
  SERVICE_LEVELS,
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
} from "@/lib/domain/status";
import {
  NEW_TRACKING_NUMBER_PATTERN,
  trackingNumberFromDigits,
} from "@/lib/domain/tracking-number";
import { dateOnly, optionalText, pageNumber, text } from "./common";

const statusEnum = z.enum(SHIPMENT_STATUSES, {
  errorMap: () => ({ message: "Choose one of the supported statuses" }),
});

const weightKg = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return undefined;
    return typeof value === "string" ? Number(value) : value;
  })
  .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
    message: "Weight must be a positive number",
  });

const packageCount = z
  .union([z.number(), z.string()], {
    required_error: "The number of packages is required",
  })
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .refine((value) => Number.isInteger(value) && value >= 1, {
    message: "Enter at least one package",
  });

/**
 * `.strict()` is deliberate: an unexpected key is rejected rather than ignored,
 * so no unvalidated field can reach the ORM.
 */
export const createShipmentSchema = z
  .object({
    trackingNumber: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => value === "" || NEW_TRACKING_NUMBER_PATTERN.test(value), {
        message: "Use TRK-DEMO- followed by up to 6 digits, for example TRK-DEMO-006",
      })
      .optional()
      .transform((value) => {
        const digits = value ? NEW_TRACKING_NUMBER_PATTERN.exec(value)?.[1] : undefined;
        return digits ? trackingNumberFromDigits(digits) : undefined;
      }),
    // A new shipment always starts as Created. Every later status comes from
    // tracking events, so the journey rules apply from the very first step.
    status: z
      .literal("CREATED", {
        errorMap: () => ({ message: "A new shipment always starts as Created" }),
      })
      .default("CREATED"),
    originCity: text("Origin city", 1, 80),
    originCountry: text("Origin country", 1, 56),
    destinationCity: text("Destination city", 1, 80),
    destinationCountry: text("Destination country", 1, 56),
    estimatedDelivery: dateOnly,
    currentLocation: optionalText("Current location", 120),
    serviceLevel: z.enum(SERVICE_LEVELS).default("STANDARD"),
    shipmentType: z.enum(SHIPMENT_TYPES).optional(),
    packageCount,
    weightKg,
    customerReference: optionalText("Customer reference", 64),
  })
  .strict();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

/**
 * Partial by design: a field that is not supplied keeps its previous value and
 * is never nulled. `trackingNumber` is absent because it is immutable — the
 * route rejects it explicitly so the caller gets an explanation rather than an
 * "unrecognised key" error.
 */
export const updateShipmentSchema = z
  .object({
    status: statusEnum,
    originCity: text("Origin city", 1, 80),
    originCountry: text("Origin country", 1, 56),
    destinationCity: text("Destination city", 1, 80),
    destinationCountry: text("Destination country", 1, 56),
    estimatedDelivery: dateOnly,
    currentLocation: optionalText("Current location", 120),
    serviceLevel: z.enum(SERVICE_LEVELS),
    shipmentType: z.enum(SHIPMENT_TYPES),
    packageCount,
    weightKg,
    customerReference: optionalText("Customer reference", 64),
  })
  .strict()
  .partial();

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

export const shipmentQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z
      .enum([...SHIPMENT_STATUSES, NEEDS_ATTENTION_FILTER], {
        errorMap: () => ({ message: "Choose one of the supported statuses" }),
      })
      .optional(),
    page: pageNumber,
  })
  .strict();

export type ShipmentQuery = z.infer<typeof shipmentQuerySchema>;
