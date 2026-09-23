import type { ShipmentStatus } from "@prisma/client";

export const SHIPMENT_STATUSES = [
  "CREATED",
  "COLLECTED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELAYED",
  "EXCEPTION",
] as const satisfies readonly ShipmentStatus[];

export const SERVICE_LEVELS = ["STANDARD", "EXPRESS", "ECONOMY"] as const;
export const SHIPMENT_TYPES = ["PARCEL", "PALLET", "DOCUMENT"] as const;
export const ENQUIRY_CATEGORIES = [
  "DELIVERY_DELAY",
  "WRONG_ADDRESS",
  "DAMAGED_OR_MISSING",
  "COLLECTION_ISSUE",
  "OTHER",
] as const;
export const ENQUIRY_STATUSES = ["OPEN", "RESOLVED"] as const;

/**
 * Plain-language labels. The public side of the product is written for someone
 * who is in a hurry and does not know logistics vocabulary, so every enum value
 * that reaches a screen passes through here.
 */
export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  CREATED: "Shipment created",
  COLLECTED: "Collected",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  EXCEPTION: "Needs attention",
};

/** One-line explanation shown beneath the status on the public tracking page. */
export const STATUS_DESCRIPTION: Record<ShipmentStatus, string> = {
  CREATED:
    "We have the shipment details. It has not been collected from the sender yet.",
  COLLECTED: "The shipment has been collected and is entering our network.",
  IN_TRANSIT: "The shipment is moving through our network.",
  OUT_FOR_DELIVERY: "The shipment is with the driver for delivery today.",
  DELIVERED: "This shipment has been delivered.",
  DELAYED:
    "This shipment is running later than planned. The estimated delivery date may have changed.",
  EXCEPTION:
    "Something needs attention before this shipment can continue. The latest update explains what.",
};

export const SERVICE_LEVEL_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  EXPRESS: "Express",
  ECONOMY: "Economy",
};

export const SHIPMENT_TYPE_LABEL: Record<string, string> = {
  PARCEL: "Parcel",
  PALLET: "Pallet",
  DOCUMENT: "Document",
};

export const ENQUIRY_CATEGORY_LABEL: Record<string, string> = {
  DELIVERY_DELAY: "Delivery is late",
  WRONG_ADDRESS: "Wrong or incomplete address",
  DAMAGED_OR_MISSING: "Damaged or missing items",
  COLLECTION_ISSUE: "Problem with collection",
  OTHER: "Something else",
};

/**
 * Tone of a status, used to pick a visual treatment. Every treatment is paired
 * with a text label and an icon at the component level, so state is never
 * communicated by colour alone.
 *
 * One tone per status (not grouped) so every status has a colour that reads as
 * distinct from every other status wherever it appears — the status badge, the
 * public status icon, the customer's progress rail and the timeline markers all
 * read from the same seven-tone palette in status-badge.tsx.
 */
export type StatusTone =
  | "neutral"
  | "collected"
  | "transit"
  | "delivery"
  | "success"
  | "warning"
  | "danger";

export const STATUS_TONE: Record<ShipmentStatus, StatusTone> = {
  CREATED: "neutral",
  COLLECTED: "collected",
  IN_TRANSIT: "transit",
  OUT_FOR_DELIVERY: "delivery",
  DELIVERED: "success",
  DELAYED: "warning",
  EXCEPTION: "danger",
};

/**
 * Which statuses mean a shipment needs someone's attention: progress has
 * stalled or an issue is holding it.
 *
 * This is the one definition used by the staff overview's counts and list, the
 * query behind them, and the customer's progress tracker. It is a Record rather
 * than a list on purpose — adding a status fails compilation here until someone
 * decides whether it belongs in the attention queue, instead of silently being
 * left out of it.
 */
const NEEDS_ATTENTION: Record<ShipmentStatus, boolean> = {
  CREATED: false,
  COLLECTED: false,
  IN_TRANSIT: false,
  OUT_FOR_DELIVERY: false,
  DELIVERED: false,
  DELAYED: true,
  EXCEPTION: true,
};

export const ATTENTION_STATUSES: ShipmentStatus[] = SHIPMENT_STATUSES.filter(
  (status) => NEEDS_ATTENTION[status],
);

export function isAttentionStatus(status: ShipmentStatus): boolean {
  return NEEDS_ATTENTION[status];
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return (
    typeof value === "string" &&
    (SHIPMENT_STATUSES as readonly string[]).includes(value)
  );
}
