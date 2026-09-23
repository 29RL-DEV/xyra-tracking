import { z } from "zod";

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Enter your email address")
      .email("Enter a valid email address")
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1, "Enter your password"),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
