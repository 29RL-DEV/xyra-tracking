import { z } from "zod";
import { ENQUIRY_CATEGORIES, ENQUIRY_STATUSES } from "@/lib/domain/status";
import { pageNumber, text, trackingNumberInput } from "./common";

export const createEnquirySchema = z
  .object({
    trackingNumber: trackingNumberInput,
    category: z.enum(ENQUIRY_CATEGORIES, {
      errorMap: () => ({ message: "Choose what your enquiry is about" }),
    }),
    message: text("Message", 10, 1000),
  })
  .strict();

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;

export const updateEnquirySchema = z
  .object({
    status: z.enum(ENQUIRY_STATUSES, {
      errorMap: () => ({ message: "An enquiry is either open or resolved" }),
    }),
  })
  .strict();

export const enquiryQuerySchema = z
  .object({
    status: z.enum(ENQUIRY_STATUSES).optional(),
    page: pageNumber,
  })
  .strict();

export type EnquiryQuery = z.infer<typeof enquiryQuerySchema>;
