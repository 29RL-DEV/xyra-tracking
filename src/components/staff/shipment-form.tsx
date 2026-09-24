"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError, apiSend } from "@/lib/api-client";
import type { StaffShipment } from "@/lib/dto/shipment";
import {
  SERVICE_LEVELS,
  SERVICE_LEVEL_LABEL,
  SHIPMENT_TYPES,
  SHIPMENT_TYPE_LABEL,
  STATUS_LABEL,
} from "@/lib/domain/status";
import {
  TRACKING_DIGITS_PATTERN,
  TRACKING_NUMBER_PREFIX,
} from "@/lib/domain/tracking-number";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/**
 * One component, two modes.
 *
 * Create and edit share a single schema and a single layout, so validation
 * cannot pass on one path and fail on the other.
 */

const formSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .refine((value) => value === "" || TRACKING_DIGITS_PATTERN.test(value), {
      message: "Use digits only, up to 6",
    }),
  originCity: z.string().trim().min(1, "Origin city is required"),
  originCountry: z.string().trim().min(1, "Origin country is required"),
  destinationCity: z.string().trim().min(1, "Destination city is required"),
  destinationCountry: z.string().trim().min(1, "Destination country is required"),
  estimatedDelivery: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an estimated delivery date"),
  currentLocation: z.string().trim(),
  serviceLevel: z.enum(SERVICE_LEVELS),
  shipmentType: z.string(),
  packageCount: z.coerce.number().int().min(1, "Enter at least one package"),
  weightKg: z.string().trim(),
  customerReference: z.string().trim(),
});

type FormValues = z.input<typeof formSchema>;

const FIELD_NAMES = [
  "trackingNumber",
  "originCity",
  "originCountry",
  "destinationCity",
  "destinationCountry",
  "estimatedDelivery",
  "currentLocation",
  "serviceLevel",
  "shipmentType",
  "packageCount",
  "weightKg",
  "customerReference",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

export function ShipmentForm({ shipment }: { shipment?: StaffShipment }) {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true once the server has saved, so the button cannot be pressed again
  // while the next page loads, which would create a second shipment.
  const [saved, setSaved] = useState(false);

  const editing = shipment !== undefined;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // Only the digits typed for a new shipment; an existing number is shown, not edited.
      trackingNumber: "",
      originCity: shipment?.origin.city ?? "",
      originCountry: shipment?.origin.country ?? "United Kingdom",
      destinationCity: shipment?.destination.city ?? "",
      destinationCountry: shipment?.destination.country ?? "United Kingdom",
      estimatedDelivery: shipment?.estimatedDelivery ?? "",
      currentLocation: shipment?.currentLocation ?? "",
      serviceLevel: shipment?.serviceLevel ?? "STANDARD",
      shipmentType: shipment?.shipmentType ?? "",
      packageCount: shipment?.packageCount ?? 1,
      weightKg: shipment?.weightKg !== undefined && shipment?.weightKg !== null
        ? String(shipment.weightKg)
        : "",
      customerReference: shipment?.customerReference ?? "",
    },
  });

  const trackingNumberField = register("trackingNumber");

  const onSubmit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = formSchema.parse(raw);

    // Empty optional fields are omitted rather than sent as empty strings, so a
    // partial update never blanks something the operator did not touch.
    const payload: Record<string, unknown> = {
      originCity: values.originCity,
      originCountry: values.originCountry,
      destinationCity: values.destinationCity,
      destinationCountry: values.destinationCountry,
      estimatedDelivery: values.estimatedDelivery,
      serviceLevel: values.serviceLevel,
      packageCount: values.packageCount,
    };

    if (values.currentLocation) payload.currentLocation = values.currentLocation;
    if (values.shipmentType) payload.shipmentType = values.shipmentType;
    if (values.weightKg) payload.weightKg = values.weightKg;
    if (values.customerReference) {
      payload.customerReference = values.customerReference;
    }

    try {
      if (editing) {
        const response = await apiSend<{ shipment: StaffShipment }>(
          `/api/staff/shipments/${shipment.id}`,
          "PATCH",
          payload,
        );
        setSaved(true);
        toast.success(`Shipment ${response.shipment.trackingNumber} updated`);
        router.push(`/staff/shipments/${shipment.id}`);
        router.refresh();
      } else {
        if (values.trackingNumber) {
          payload.trackingNumber = `${TRACKING_NUMBER_PREFIX}${values.trackingNumber}`;
        }

        const response = await apiSend<{ shipment: StaffShipment }>(
          "/api/staff/shipments",
          "POST",
          payload,
        );
        setSaved(true);
        toast.success(`Shipment ${response.shipment.trackingNumber} created`);
        router.push(`/staff/shipments/${response.shipment.id}`);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        let handled = false;

        for (const [field, message] of Object.entries(error.fields ?? {})) {
          if (isFieldName(field)) {
            setError(field, { message });
            handled = true;
          }
        }

        if (!handled) setFormError(error.message);
        return;
      }

      setFormError("We could not save this shipment. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert tone="error" role="alert" title="The shipment was not saved">
          {formError}
        </Alert>
      ) : null}

      <Card as="div" className="divide-y divide-line-strong/60">
      <FormSection
        title="Identification"
        description="How the shipment is identified and how quickly it travels."
      >
        {editing ? (
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-ink">Tracking number</p>
            <p className="mt-1.5 inline-flex rounded-lg bg-surface-sunken px-3 py-2 font-mono text-sm font-semibold text-ink">
              {shipment.trackingNumber}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              A tracking number cannot be changed after creation — customers may already be
              using it.
            </p>
          </div>
        ) : (
          <Field
            label="Tracking number"
            required={false}
            hint={`Type the digits only, ${TRACKING_NUMBER_PREFIX} is added for you. Leave blank to use the next free number.`}
            error={errors.trackingNumber?.message}
            className="sm:col-span-2"
          >
            <div className="flex">
              <span
                aria-hidden="true"
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-l-lg border border-r-0 border-edge bg-surface-sunken px-3 font-mono text-sm font-semibold text-ink-muted"
              >
                {TRACKING_NUMBER_PREFIX}
              </span>
              <Input
                {...trackingNumberField}
                onChange={(event) => {
                  // Only digits can be typed, so the number always fits the format.
                  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
                  void trackingNumberField.onChange(event);
                }}
                inputMode="numeric"
                placeholder="006"
                className="rounded-l-none font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </Field>
        )}

        {/* Status is never edited here: it follows the tracking events. */}
        <div>
          <p className="text-sm font-medium text-ink">Status</p>
          <p className="mt-1.5 inline-flex rounded-lg bg-surface-sunken px-3 py-2 text-sm font-semibold text-ink">
            {STATUS_LABEL[shipment?.status ?? "CREATED"]}
          </p>
          <p className="mt-1.5 text-sm text-ink-muted">
            {editing
              ? "The status changes when you add a tracking event on the shipment page."
              : "Every new shipment starts here. Its status then moves on with the tracking events."}
          </p>
        </div>

        <Field label="Service level" required error={errors.serviceLevel?.message}>
          <Select {...register("serviceLevel")}>
            {SERVICE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {SERVICE_LEVEL_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Route" description="Where the shipment starts, where it is going, and where it is now.">
        <Field label="Origin city" required error={errors.originCity?.message}>
          <Input {...register("originCity")} />
        </Field>
        <Field label="Origin country" required error={errors.originCountry?.message}>
          <Input {...register("originCountry")} />
        </Field>
        <Field label="Destination city" required error={errors.destinationCity?.message}>
          <Input {...register("destinationCity")} />
        </Field>
        <Field label="Destination country" required error={errors.destinationCountry?.message}>
          <Input {...register("destinationCountry")} />
        </Field>
        <Field
          label="Current location"
          required={false}
          hint="Defaults to the origin city when left blank."
          error={errors.currentLocation?.message}
          className="sm:col-span-2"
        >
          <Input {...register("currentLocation")} />
        </Field>
      </FormSection>

      <FormSection
        title="Schedule and contents"
        description="What the customer is told to expect, and what is being carried."
      >
        <Field label="Estimated delivery" required error={errors.estimatedDelivery?.message}>
          <Input {...register("estimatedDelivery")} type="date" />
        </Field>

        <Field label="Shipment type" required={false} error={errors.shipmentType?.message}>
          <Select {...register("shipmentType")}>
            <option value="">Not specified</option>
            {SHIPMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {SHIPMENT_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Number of packages" required error={errors.packageCount?.message}>
          <Input {...register("packageCount")} type="number" min={1} step={1} inputMode="numeric" />
        </Field>

        <Field label="Weight (kg)" required={false} error={errors.weightKg?.message}>
          <Input {...register("weightKg")} type="number" min={0} step="0.01" inputMode="decimal" />
        </Field>

        <Field
          label="Customer reference"
          required={false}
          error={errors.customerReference?.message}
          className="sm:col-span-2"
        >
          <Input {...register("customerReference")} maxLength={64} />
        </Field>
      </FormSection>
      </Card>

      {/* From tablet width up this floats at the bottom of the viewport, so saving
          never needs a scroll back down. On a phone it would cover too much of
          the form, so it stays at the end. */}
      <div
        data-sticky-actions=""
        className="z-20 flex flex-col-reverse gap-3 rounded-xl bg-surface p-4 shadow-surface sm:sticky sm:bottom-4 sm:flex-row sm:items-center sm:justify-between sm:bg-surface/95 sm:px-6 sm:shadow-overlay sm:backdrop-blur"
      >
        <p className="text-sm text-ink-muted">
          {editing
            ? "Saving never changes the tracking history the customer has already seen."
            : "The shipment can be tracked publicly as soon as it is created."}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <ButtonLink
            href={editing ? `/staff/shipments/${shipment.id}` : "/staff/shipments"}
            variant="secondary"
          >
            Cancel
          </ButtonLink>
          <Button
            type="submit"
            loading={isSubmitting || saved}
            loadingLabel={editing ? "Saving..." : "Creating..."}
          >
            {editing ? "Save changes" : "Create shipment"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * A titled group of fields: explanation on the left, inputs on the right on
 * wide screens, stacked on narrow ones. The fieldset takes its accessible name
 * from the section heading, so the group is announced with its title.
 */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const id = useId();

  return (
    <fieldset aria-labelledby={id} className="min-w-0">
      <div className="grid gap-x-10 gap-y-5 px-5 py-7 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h2 id={id} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        </div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">{children}</div>
      </div>
    </fieldset>
  );
}
