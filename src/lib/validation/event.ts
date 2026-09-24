import { z } from "zod";
import { SHIPMENT_STATUSES } from "@/lib/domain/status";
import { isoDateTime, text } from "./common";

export const createEventSchema = z
  .object({
    occurredAt: isoDateTime.optional(),
    location: text("Location", 1, 120),
    type: z.enum(SHIPMENT_STATUSES, {
      errorMap: () => ({ message: "Choose one of the supported event types" }),
    }),
    message: text("Message", 3, 280),
  })
  .strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;
