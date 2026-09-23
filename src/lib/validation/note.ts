import { z } from "zod";
import { text } from "./common";

export const createNoteSchema = z
  .object({
    body: text("Note", 1, 1000),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
