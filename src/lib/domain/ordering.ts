/**
 * The single ordering rule for tracking events.
 *
 * Public timeline, staff timeline and the "latest update" shown in the summary
 * all call this, so those three can never disagree. The triple tie-break makes
 * ordering deterministic when two events share a timestamp, which seeded data
 * does produce.
 */

export interface OrderableEvent {
  occurredAt: Date;
  createdAt: Date;
  id: string;
}

/** Newest first. Returns a new array; the input is not mutated. */
export function orderEventsNewestFirst<T extends OrderableEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const byOccurred = b.occurredAt.getTime() - a.occurredAt.getTime();
    if (byOccurred !== 0) return byOccurred;

    const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
    if (byCreated !== 0) return byCreated;

    return b.id.localeCompare(a.id);
  });
}

/** The most recent event, or null when there are none. */
export function latestEvent<T extends OrderableEvent>(events: readonly T[]): T | null {
  return orderEventsNewestFirst(events)[0] ?? null;
}

/**
 * Prisma order-by clause matching the comparator above, so the database returns
 * rows in the same order the comparator would produce.
 */
export const EVENT_ORDER_BY = [
  { occurredAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
] as const;
