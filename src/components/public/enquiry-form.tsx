"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { ApiError, apiSend } from "@/lib/api-client";
import { enquiryReference } from "@/lib/domain/enquiry-reference";
import { ENQUIRY_CATEGORIES, ENQUIRY_CATEGORY_LABEL } from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/**
 * The customer's way to reach staff.
 *
 * No name, email or phone field exists: the brief is explicit that real
 * personal information must not be required, so the form asks only for what
 * staff need to act — which shipment, what kind of problem, and the message.
 */

const MESSAGE_MAX = 1000;

const formSchema = z.object({
  trackingNumber: z.string().trim().min(1, "Enter a tracking number"),
  category: z.enum(ENQUIRY_CATEGORIES, {
    errorMap: () => ({ message: "Choose what your enquiry is about" }),
  }),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters so we can help")
    .max(MESSAGE_MAX, "Please keep your message to 1000 characters or fewer"),
});

type FormValues = z.infer<typeof formSchema>;

interface Receipt {
  id: string;
  createdAt: string;
}

export function EnquiryForm({ trackingNumber }: { trackingNumber: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { trackingNumber, category: "DELIVERY_DELAY", message: "" },
  });

  // Counted as validated: leading and trailing spaces are trimmed before the
  // length is checked, so they do not count towards the minimum or the limit.
  const messageLength = (watch("message") ?? "").trim().length;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const response = await apiSend<{ enquiry: Receipt }>(
        "/api/enquiries",
        "POST",
        values,
      );

      setReceipt(response.enquiry);
      reset({ trackingNumber, category: "DELIVERY_DELAY", message: "" });

      // Tell a screen-reader user the outcome, not just sighted users.
      requestAnimationFrame(() => confirmationRef.current?.focus());
    } catch (error) {
      if (error instanceof ApiError) {
        // Server field errors land on the same inputs as client errors.
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            if (field === "trackingNumber" || field === "category" || field === "message") {
              setError(field, { message });
            }
          }
        }

        if (error.code === "SHIPMENT_NOT_FOUND") {
          setError("trackingNumber", {
            message:
              "We could not find that tracking number. Check it and try again.",
          });
          return;
        }

        if (!error.fields) {
          setFormError(error.message);
        }
        return;
      }

      setFormError("We could not send your enquiry. Please try again.");
    }
  });

  if (receipt) {
    return (
      <section aria-labelledby="enquiry-confirmation-heading" className="animate-fade-in">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2
          id="enquiry-confirmation-heading"
          ref={confirmationRef}
          tabIndex={-1}
          className="mt-4 text-title text-ink focus:outline-none"
        >
          We have received your enquiry
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Our operations team will look into shipment {trackingNumber} and update its tracking
          history.
        </p>
        <dl className="mt-4">
          <dt className="text-sm text-ink-subtle">Your reference</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold tracking-wide text-ink">
            {enquiryReference(receipt.id)}
          </dd>
        </dl>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => setReceipt(null)}>
            Send another enquiry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="enquiry-heading">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink-muted"
        >
          <MessageSquareText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="enquiry-heading" className="text-base font-semibold text-ink">
            Something wrong with this shipment?
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Send our operations team a message about this shipment.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {formError ? (
          <Alert tone="error" role="alert" title="Your enquiry was not sent">
            {formError}
          </Alert>
        ) : null}

        <Field label="Tracking number" required error={errors.trackingNumber?.message}>
          <Input
            {...register("trackingNumber")}
            className="font-mono uppercase"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="What is your enquiry about?"
          required
          error={errors.category?.message}
        >
          <Select {...register("category")}>
            {ENQUIRY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {ENQUIRY_CATEGORY_LABEL[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Your message"
          required
          hint="Tell us what has happened. Please do not include personal or payment details."
          error={errors.message?.message}
          labelAction={
            <span
              className={cn(
                "text-xs tabular-nums",
                messageLength > MESSAGE_MAX ? "font-semibold text-red-700" : "text-ink-subtle",
              )}
              aria-hidden="true"
            >
              {messageLength}/{MESSAGE_MAX}
            </span>
          }
        >
          <Textarea {...register("message")} maxLength={MESSAGE_MAX} rows={5} />
        </Field>

        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          No account needed, and we never ask for your name, address or contact details here.
        </p>
        <p className="-mt-2 pl-6 text-sm">
          <Link
            href="/privacy"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            How we use what you send
          </Link>
        </p>

        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          loading={isSubmitting}
          loadingLabel="Sending your enquiry..."
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send enquiry
        </Button>
      </form>
    </section>
  );
}
