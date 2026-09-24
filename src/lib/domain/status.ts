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
  EXCEPTION: "Delivery exception",
};

/**
 * The customer message used when staff leave it blank on a routine step. Delays
 * and problems have none: the customer must be told what happened, so staff
 * write that message themselves.
 */
export const DEFAULT_EVENT_MESSAGE: Partial<Record<ShipmentStatus, string>> = {
  CREATED: "Your shipment has been created.",
  COLLECTED: "Your shipment has been collected.",
  IN_TRANSIT: "Your shipment is on its way.",
  OUT_FOR_DELIVERY: "Your shipment is out for delivery today.",
  DELIVERED: "Your shipment has been delivered.",
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

/**
 * Staff list filter value selecting every attention status at once, so the
 * overview's "Delayed or held" figure links to exactly the shipments it counts.
 */
export const NEEDS_ATTENTION_FILTER = "NEEDS_ATTENTION";
export const NEEDS_ATTENTION_FILTER_LABEL = "Delayed or held";

export function isAttentionStatus(status: ShipmentStatus): boolean {
  return NEEDS_ATTENTION[status];
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return (
    typeof value === "string" &&
    (SHIPMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The steps of the journey, in order. Delayed and Exception are not steps: they
 * interrupt the journey at whatever step it had reached.
 */
const PROGRESS_STATUSES: readonly ShipmentStatus[] = [
  "CREATED",
  "COLLECTED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/**
 * Where a shipment can go from each step. Progress only moves forward, one step
 * at a time. In transit is one long stage (every hub and depot on the way is an
 * In transit event with its own location), and only from there can a shipment
 * go back to Collected, when it is returned to the depot it came from. Once out
 * for delivery it can only be delivered, or run into a delay or problem.
 * Delivered is final.
 */
const NEXT_STEPS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: ["COLLECTED", "DELAYED", "EXCEPTION"],
  COLLECTED: ["IN_TRANSIT", "DELAYED", "EXCEPTION"],
  IN_TRANSIT: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "COLLECTED", "DELAYED", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELAYED", "EXCEPTION"],
  DELIVERED: [],
  DELAYED: [],
  EXCEPTION: [],
};

/**
 * The step a shipment had reached: the newest event that is not a delay or a
 * problem. `typesNewestFirst` are its event types, newest first.
 */
export function journeyStep(typesNewestFirst: readonly ShipmentStatus[]): ShipmentStatus {
  return typesNewestFirst.find((type) => PROGRESS_STATUSES.includes(type)) ?? "CREATED";
}

/**
 * The statuses a shipment can move to next. After a delay or a problem it can
 * get further updates of either kind, or carry on from the step it had reached:
 * repeat that step when a step can happen more than once (another hub, another
 * delivery attempt), or move on to the next one. It can never jump ahead.
 */
export function allowedNextStatuses(
  current: ShipmentStatus,
  step: ShipmentStatus,
): ShipmentStatus[] {
  if (current !== "DELAYED" && current !== "EXCEPTION") return [...NEXT_STEPS[current]];

  const resume = step === "IN_TRANSIT" || step === "OUT_FOR_DELIVERY" ? [step] : [];
  // Going back to Collected (returned to the depot it came from) is only offered
  // straight from In transit, never as a way out of a delay or a problem. From
  // Created, Collected is the next step forward and stays.
  const onward = NEXT_STEPS[step].filter(
    (status) =>
      status !== "DELAYED" &&
      status !== "EXCEPTION" &&
      !(step === "IN_TRANSIT" && status === "COLLECTED"),
  );

  return [...new Set<ShipmentStatus>([...resume, ...onward, "DELAYED", "EXCEPTION"])];
}

/**
 * The statuses an event may have when it is added into the middle of the
 * history, dated after `before` (oldest first) and ahead of the event `after`.
 * It has to follow what came before it and be followable by what came after, by
 * the same rules as the journey itself. Empty when nothing came before it, since
 * nothing can be dated ahead of the shipment's first event.
 */
export function statusesAllowedBetween(
  before: readonly ShipmentStatus[],
  after: ShipmentStatus | null,
): ShipmentStatus[] {
  const previous = before[before.length - 1];
  if (!previous) return [];

  const newestFirst = [...before].reverse();

  return allowedNextStatuses(previous, journeyStep(newestFirst)).filter(
    (candidate) =>
      after === null ||
      allowedNextStatuses(candidate, journeyStep([candidate, ...newestFirst])).includes(after),
  );
}

/**
 * Splits a history at a moment: the event types dated at or before it (oldest
 * first), and the type of the first event dated after it.
 */
export function splitHistoryAt(
  history: readonly { type: ShipmentStatus; occurredAt: string | Date }[],
  moment: Date,
): { before: ShipmentStatus[]; after: ShipmentStatus | null } {
  const sorted = [...history].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  const at = moment.getTime();

  return {
    before: sorted.filter((event) => new Date(event.occurredAt).getTime() <= at).map((e) => e.type),
    after: sorted.find((event) => new Date(event.occurredAt).getTime() > at)?.type ?? null,
  };
}
