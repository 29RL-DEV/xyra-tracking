"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { z } from "zod";
import { ApiError, apiSend } from "@/lib/api-client";
import type { ShipmentStatus } from "@prisma/client";
import {
  allowedNextStatuses,
  DEFAULT_EVENT_MESSAGE,
  SHIPMENT_STATUSES,
  splitHistoryAt,
  STATUS_LABEL,
  statusesAllowedBetween,
} from "@/lib/domain/status";
import { toLocalDateTimeInput } from "@/lib/format/date";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const formSchema = z.object({
  occurredAt: z.string().min(1, "Choose when this happened"),
  location: z.string().trim().min(1, "Location is required").max(120),
  type: z.enum(SHIPMENT_STATUSES),
  message: z.string().trim().max(280, "Keep the message to 280 characters or fewer"),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Appends a tracking event.
 *
 * The server decides whether the event changes the shipment: the newest event
 * sets its status and location, a back-dated one only fills in history. The
 * form states that rule rather than offering a choice that could leave the
 * customer's latest update contradicting the status.
 *
 * Choosing "Delivered" suggests the destination as the location, which the
 * operator can edit; the customer's street address is never stored or shown.
 *
 * The event types offered follow the journey from the shipment's current status.
 * An event dated before the latest update only fills in history, so it is
 * offered the types that fit where it is dated. The server applies the same rules.
 */
export function AddEventForm({
  shipmentId,
  currentStatus,
  journeyStep,
  history,
  deliveryLocation,
}: {
  shipmentId: string;
  currentStatus: ShipmentStatus;
  /** The step the journey had reached, which a delay or problem resumes from. */
  journeyStep: ShipmentStatus;
  /** Every event of the shipment: its type and when it happened. */
  history: { type: ShipmentStatus; occurredAt: string }[];
  deliveryLocation: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // Filled in after mounting: "now" in the operator's own timezone is only
      // known in the browser, and computing it on the server would render a
      // different value from the one the browser hydrates with.
      occurredAt: "",
      location: "",
      type: allowedNextStatuses(currentStatus, journeyStep)[0] ?? currentStatus,
      message: "",
    },
  });

  useEffect(() => {
    setValue("occurredAt", toLocalDateTimeInput(new Date()));
  }, [setValue]);

  const type = watch("type");
  const occurredAt = watch("occurredAt");

  // An event dated before the latest one only fills in history, so it must fit
  // where it is dated. Anything at or after the latest event follows the journey.
  const { tooEarly, typeOptions } = useMemo(() => {
    const moment = occurredAt === "" ? null : momentOf(occurredAt);
    const latest = history.reduce((max, event) => Math.max(max, new Date(event.occurredAt).getTime()), 0);

    if (moment && history.length > 0 && moment.getTime() < latest) {
      const { before, after } = splitHistoryAt(history, moment);
      const fitting = statusesAllowedBetween(before, after);

      return {
        tooEarly: before.length === 0,
        typeOptions: (fitting.length > 0 ? fitting : [currentStatus]) as readonly ShipmentStatus[],
      };
    }

    const next = allowedNextStatuses(currentStatus, journeyStep);
    return {
      tooEarly: false,
      typeOptions: (next.length > 0 ? next : [currentStatus]) as readonly ShipmentStatus[],
    };
  }, [occurredAt, history, currentStatus, journeyStep]);

  useEffect(() => {
    const first = typeOptions[0];
    if (first && !typeOptions.includes(getValues("type"))) {
      setValue("type", first);
    }
  }, [typeOptions, getValues, setValue]);

  // Only an empty field is filled in, and only our own suggestion is cleared
  // again, so anything the operator typed is never overwritten.
  useEffect(() => {
    const location = getValues("location");

    if (type === "DELIVERED" && location === "") {
      setValue("location", deliveryLocation);
    } else if (type !== "DELIVERED" && location === deliveryLocation) {
      setValue("location", "");
    }
  }, [type, deliveryLocation, getValues, setValue]);

  // A routine step gets a standard message when this is left blank; a delay or a
  // problem has to be explained to the customer.
  const standardMessage = DEFAULT_EVENT_MESSAGE[type];

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    if (!standardMessage && values.message.length < 3) {
      setError("message", { message: "Explain to the customer what has happened" });
      return;
    }

    try {
      const result = await apiSend<{ shipmentUpdated: boolean }>(
        `/api/staff/shipments/${shipmentId}/events`,
        "POST",
        {
          // datetime-local has no timezone; convert from the operator's local
          // time to an absolute instant before sending.
          occurredAt: momentOf(values.occurredAt).toISOString(),
          location: values.location,
          type: values.type,
          ...(values.message ? { message: values.message } : {}),
        },
      );

      toast.success(
        result.shipmentUpdated
          ? "Event added and shipment updated"
          : "Earlier event added to the tracking history",
      );

      reset({
        occurredAt: toLocalDateTimeInput(new Date()),
        location: "",
        type: values.type,
        message: "",
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
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="When it happened"
          required
          error={
            errors.occurredAt?.message ??
            (tooEarly ? "An earlier event cannot be dated before the shipment's first event." : undefined)
          }
        >
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
          required={!standardMessage}
          hint={
            standardMessage
              ? `Optional. If left blank, the customer sees: "${standardMessage}"${
                  type === "DELIVERED" ? " Add a detail if there is one, for example: left in the garden." : ""
                }`
              : "Appears on the public tracking page. Explain what has happened and what the customer can expect."
          }
          error={errors.message?.message}
          className="sm:col-span-2"
        >
          <Textarea {...register("message")} maxLength={280} rows={3} className="min-h-[5.5rem]" />
        </Field>
      </div>

      <p className="rounded-lg bg-white p-4 text-sm text-ink-muted shadow-sm">
        {currentStatus === "DELIVERED" ? (
          <>
            <span className="font-medium text-ink">This shipment has been delivered.</span>{" "}
            Delivery is final, so it can only receive earlier events that fill in its
            history: set &ldquo;When it happened&rdquo; before the delivery.
          </>
        ) : (
          <>
            <span className="font-medium text-ink">
              The newest event sets the shipment&apos;s status and current location.
            </span>{" "}
            Only the next steps of the journey are offered. An event dated before the latest
            update is added to the history only, so the shipment keeps its current state.
          </>
        )}
      </p>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} loadingLabel="Adding event..." disabled={tooEarly}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add event
        </Button>
      </div>
    </form>
  );
}

/**
 * The instant a "When it happened" value stands for. The field has no seconds,
 * so the current minute means right now: read literally it would fall a few
 * seconds before an event recorded earlier in the same minute, and be treated
 * as back-dated.
 */
function momentOf(value: string): Date {
  return value === toLocalDateTimeInput(new Date()) ? new Date() : new Date(value);
}
