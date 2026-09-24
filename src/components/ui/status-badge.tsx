import type { ShipmentStatus } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackagePlus,
  Truck,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/domain/status";
import { cn } from "@/lib/cn";

/**
 * The status visual language, in one place.
 *
 * Every status pairs a text label with a distinct icon, so the state survives
 * greyscale, colour blindness and a screen reader. Colour is an accent, never
 * the message.
 */

export const STATUS_ICON: Record<ShipmentStatus, LucideIcon> = {
  CREATED: PackagePlus,
  COLLECTED: PackageCheck,
  IN_TRANSIT: Truck,
  OUT_FOR_DELIVERY: Navigation,
  DELIVERED: CheckCircle2,
  DELAYED: Clock3,
  EXCEPTION: AlertTriangle,
};

/**
 * Tone palette shared by badges, markers, callouts and tiles.
 *
 * One exact colour per status (not grouped), matching the seven-colour
 * breakdown on the staff overview: slate / cyan / blue / violet / green /
 * orange / red, so a status reads as the same colour everywhere it appears.
 */
export const TONE_STYLES: Record<
  StatusTone,
  { badge: string; solid: string; soft: string; text: string; ring: string }
> = {
  neutral: {
    // #64748B — slate (Shipment created)
    badge: "bg-[#64748B]/15 text-[#64748B]",
    solid: "bg-[#64748B] text-white",
    soft: "bg-[#64748B]/10 text-[#64748B]",
    text: "text-[#64748B]",
    ring: "ring-[#64748B]/25",
  },
  collected: {
    // #06B6D4 — cyan (Collected)
    badge: "bg-[#06B6D4]/15 text-[#06B6D4]",
    solid: "bg-[#06B6D4] text-white",
    soft: "bg-[#06B6D4]/10 text-[#06B6D4]",
    text: "text-[#06B6D4]",
    ring: "ring-[#06B6D4]/25",
  },
  transit: {
    // #2563EB — blue (In transit)
    badge: "bg-[#2563EB]/15 text-[#2563EB]",
    solid: "bg-[#2563EB] text-white",
    soft: "bg-[#2563EB]/10 text-[#2563EB]",
    text: "text-[#2563EB]",
    ring: "ring-[#2563EB]/25",
  },
  delivery: {
    // #7C3AED — violet (Out for delivery)
    badge: "bg-[#7C3AED]/15 text-[#7C3AED]",
    solid: "bg-[#7C3AED] text-white",
    soft: "bg-[#7C3AED]/10 text-[#7C3AED]",
    text: "text-[#7C3AED]",
    ring: "ring-[#7C3AED]/25",
  },
  success: {
    // #16A34A — green (Delivered)
    badge: "bg-[#16A34A]/15 text-[#16A34A]",
    solid: "bg-[#16A34A] text-white",
    soft: "bg-[#16A34A]/10 text-[#16A34A]",
    text: "text-[#16A34A]",
    ring: "ring-[#16A34A]/25",
  },
  warning: {
    // #EA580C — orange (Delayed)
    badge: "bg-[#EA580C]/15 text-[#EA580C]",
    solid: "bg-[#EA580C] text-white",
    soft: "bg-[#EA580C]/10 text-[#EA580C]",
    text: "text-[#EA580C]",
    ring: "ring-[#EA580C]/25",
  },
  danger: {
    // #DC2626 — red (Delivery exception)
    badge: "bg-[#DC2626]/15 text-[#DC2626]",
    solid: "bg-[#DC2626] text-white",
    soft: "bg-[#DC2626]/10 text-[#DC2626]",
    text: "text-[#DC2626]",
    ring: "ring-[#DC2626]/25",
  },
};

export function statusTone(status: ShipmentStatus): StatusTone {
  return STATUS_TONE[status];
}

export function StatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: ShipmentStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  const tone = TONE_STYLES[STATUS_TONE[status]];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        tone.badge,
        size === "lg" && "px-3.5 py-1.5 text-sm",
        size === "md" && "px-3 py-1 text-sm",
        size === "sm" && "px-2.5 py-0.5 text-xs leading-5",
        className,
      )}
      data-status={status}
    >
      <Icon
        className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")}
        aria-hidden="true"
        strokeWidth={2.25}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A round icon tile for a status. Decorative: always paired with text. */
export function StatusIcon({
  status,
  size = "md",
  className,
}: {
  status: ShipmentStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  const tone = TONE_STYLES[STATUS_TONE[status]];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        tone.solid,
        size === "sm" && "h-7 w-7",
        size === "md" && "h-10 w-10",
        size === "lg" && "h-12 w-12",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : size === "md" ? "h-5 w-5" : "h-6 w-6"} strokeWidth={2.25} />
    </span>
  );
}
