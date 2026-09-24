import { z } from "zod";
import { DEFAULT_EVENT_MESSAGE, SHIPMENT_STATUSES } from "@/lib/domain/status";
import { isoDateTime, text } from "./common";

const MESSAGE_REQUIRED = "Explain to the customer what has happened";

/**
 * The message is optional on routine steps, which then get a standard one, and
 * required for a delay or a problem, which the customer must have explained.
 */
export const createEventSchema = z
  .object({
    occurredAt: isoDateTime.optional(),
    location: text("Location", 1, 120),
    type: z.enum(SHIPMENT_STATUSES, {
      errorMap: () => ({ message: "Choose one of the supported event types" }),
    }),
    message: z
      .string()
      .trim()
      .max(280, "Message must be 280 characters or fewer")
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const message = input.message ?? "";
    const standard = DEFAULT_EVENT_MESSAGE[input.type];

    if (message === "" && !standard) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: MESSAGE_REQUIRED });
    } else if (message !== "" && message.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Message must be at least 3 characters",
      });
    }
  })
  .transform((input) => ({
    ...input,
    message: input.message || DEFAULT_EVENT_MESSAGE[input.type] || "",
  }));

export type CreateEventInput = z.infer<typeof createEventSchema>;
