"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { z } from "zod";
import { ApiError, apiSend } from "@/lib/api-client";
import { SHIPMENT_STATUSES, STATUS_LABEL } from "@/lib/domain/status";
import { toLocalDateTimeInput } from "@/lib/format/date";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const formSchema = z.object({
  occurredAt: z.string().min(1, "Choose when this happened"),
  location: z.string().trim().min(1, "Location is required").max(120),
  type: z.enum(SHIPMENT_STATUSES),
  message: z
    .string()
    .trim()
    .min(3, "Write a short message the customer can understand")
    .max(280, "Keep the message to 280 characters or fewer"),
  updateShipment: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Appends a tracking event.
 *
 * The propagation checkbox is off by default and stated in plain words:
 * back-filling a historical event must never silently drag the shipment's
 * present status backwards.
 */
export function AddEventForm({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // Filled in after mounting: "now" in the operator's own timezone is only
      // known in the browser, and computing it on the server would render a
      // different value from the one the browser hydrates with.
      occurredAt: "",
      location: "",
      type: "IN_TRANSIT",
      message: "",
      updateShipment: false,
    },
  });

  useEffect(() => {
    setValue("occurredAt", toLocalDateTimeInput(new Date()));
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiSend(`/api/staff/shipments/${shipmentId}/events`, "POST", {
        // datetime-local has no timezone; convert from the operator's local
        // time to an absolute instant before sending.
        occurredAt: new Date(values.occurredAt).toISOString(),
        location: values.location,
        type: values.type,
        message: values.message,
        updateShipment: values.updateShipment,
      });

      toast.success(
        values.updateShipment
          ? "Event added and shipment updated"
          : "Event added to the tracking history",
      );

      reset({
        occurredAt: toLocalDateTimeInput(new Date()),
        location: "",
        type: values.type,
        message: "",
        updateShipment: false,
      });

      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        let handled = false;

        for (const [field, message] of Object.entries(error.fields ?? {})) {
          if (
            field === "occurredAt" ||
            field === "location" ||
            field === "type" ||
            field === "message"
          ) {
            setError(field, { message });
            handled = true;
          }
        }

        if (!handled) setFormError(error.message);
        return;
      }

      setFormError("We could not add this event. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <Alert tone="error" role="alert" title="The event was not added">
          {formError}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event type" required error={errors.type?.message}>
          <Select {...register("type")}>
            {SHIPMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="When it happened" required error={errors.occurredAt?.message}>
          <Input {...register("occurredAt")} type="datetime-local" />
        </Field>

        <Field
          label="Location"
          required
          error={errors.location?.message}
          className="sm:col-span-2"
        >
          <Input {...register("location")} placeholder="Gralebridge regional hub" />
        </Field>

        <Field
          label="Message to the customer"
          required
          hint="This text appears on the public tracking page."
          error={errors.message?.message}
          className="sm:col-span-2"
        >
          <Textarea {...register("message")} maxLength={280} rows={3} className="min-h-[5.5rem]" />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-4 text-sm shadow-sm transition-colors hover:bg-surface has-[:checked]:bg-brand-50">
        <input
          type="checkbox"
          {...register("updateShipment")}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-edge accent-brand-700"
        />
        <span className="text-ink">
          <span className="font-medium">
            Also update the shipment&apos;s status and current location to match this event
          </span>
          <span className="mt-0.5 block text-ink-muted">
            Leave this unchecked when recording something that happened earlier, so the
            shipment keeps its current state.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} loadingLabel="Adding event...">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add event
        </Button>
      </div>
    </form>
  );
}
