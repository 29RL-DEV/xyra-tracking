import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normaliseTrackingNumber } from "@/lib/domain/tracking-number";
import { logError } from "@/lib/log";

/**
 * Rate limits counted in PostgreSQL, so every application instance sees the
 * same numbers.
 *
 * The in-memory limiter in src/lib/api/rate-limit.ts counts per serverless
 * instance: enough to slow one careless client, not enough to bound the
 * system. Enquiry submission is the only unauthenticated write, and whatever
 * it accepts lands in the staff queue, so its limits are counted here instead,
 * in the database every instance already shares.
 *
 * Each limit is a fixed window aligned to the database clock. Every instance
 * asks PostgreSQL which window "now" falls in, so instances whose own clocks
 * disagree still count into the same row. A fixed window lets a client spend
 * one window's allowance at its very end and the next one's at the start of
 * the following window, so a short burst can reach twice the limit. That is
 * the price of counting a hit in one statement with no lock held between
 * requests, and it is acceptable for these limits.
 *
 * There is no fallback. If the database cannot be reached, counting fails and
 * the request fails with it, as a logged 500 like any other database failure.
 * An enquiry cannot be stored without the database anyway, so letting the
 * request through uncounted would gain nothing.
 */

export interface SharedRateLimitOptions {
  limit: number;
  /** Window length in whole seconds, at most MAX_WINDOW_SECONDS. */
  windowSeconds: number;
}

/**
 * Enquiry limits. All three are counted before an enquiry is created, and
 * going over any one of them is the same 429.
 *
 * - Per client address, 10 every 10 minutes, as before this limit was shared.
 *   Far more than a customer writing about their own parcels needs. The
 *   address comes from a forwarded header, so on its own this is mitigation
 *   rather than protection.
 * - Per tracking number, 20 an hour, from whatever addresses: one shipment
 *   cannot be used to bury the queue. It is counted before the shipment is
 *   looked up, so an unknown number uses up its allowance exactly as a real
 *   one does, and a 429 says nothing about whether the number exists.
 * - Across all enquiries, 300 an hour, counting every valid submission that
 *   gets past the two limits above: a circuit breaker against a flood spread
 *   over many addresses and tracking numbers, which neither of them can see. It keeps the staff queue to a size people can work through. The
 *   trade-off is deliberate: while a large flood lasts, legitimate customers
 *   are turned away with the rest and have to wait for the next hour. That is
 *   judged better than a queue of thousands in which their enquiries would be
 *   lost anyway.
 */
export const ENQUIRY_CLIENT_LIMIT: SharedRateLimitOptions = {
  limit: 10,
  windowSeconds: 10 * 60,
};

export const ENQUIRY_TRACKING_NUMBER_LIMIT: SharedRateLimitOptions = {
  limit: 20,
  windowSeconds: 60 * 60,
};

export const ENQUIRY_GLOBAL_LIMIT: SharedRateLimitOptions = {
  limit: 300,
  windowSeconds: 60 * 60,
};

/*
 * Keys are stored as given, so the table holds client addresses and tracking
 * numbers. The sweep below means neither is kept for much more than a day
 * after its window ends. The prefixes keep the three kinds of key apart.
 */
export function enquiryClientKey(client: string): string {
  return `enquiry:client:${client}`;
}

export function enquiryTrackingNumberKey(trackingNumber: string): string {
  return `enquiry:tracking-number:${normaliseTrackingNumber(trackingNumber)}`;
}

export const ENQUIRY_GLOBAL_KEY = "enquiry:all";

/**
 * The longest window countSharedHit accepts. Bounding it is what lets the
 * sweep tell an ended row from a live one without storing each row's window
 * length.
 */
const MAX_WINDOW_SECONDS = 60 * 60;

/**
 * How long a counter is kept once its window has ended. Nothing reads it by
 * then; the margin only keeps the sweep well clear of rows still in use.
 */
const RETAIN_AFTER_END_SECONDS = 24 * 60 * 60;

/**
 * Roughly one hit in fifty also sweeps. Often enough that the table stays
 * about as large as a day's traffic, rarely enough that the extra statement
 * is not paid on every request.
 */
const SWEEP_PROBABILITY = 1 / 50;

/**
 * What counting needs from a database client. The application passes nothing
 * and gets the shared client; a test passes a second client to stand in for a
 * second application instance.
 */
export type RateLimitDatabase = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/**
 * Counts one hit against a key and says whether it is within the limit.
 *
 * One statement, so concurrent hits can never read the same count: the first
 * creates the window's row, and every later one, on any instance, waits for
 * the row lock and increments it. Each gets back the count including itself,
 * so exactly `limit` hits in a window are allowed.
 *
 * Every hit counts, including those turned away, but the window still ends
 * when it would have: a client that keeps sending neither gets through nor
 * extends its own wait.
 */
export async function countSharedHit(
  key: string,
  options: SharedRateLimitOptions,
  db: RateLimitDatabase = prisma,
): Promise<boolean> {
  const { windowSeconds } = options;

  if (
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1 ||
    windowSeconds > MAX_WINDOW_SECONDS
  ) {
    throw new Error(
      `A shared rate-limit window must be a whole number of seconds from 1 to ${MAX_WINDOW_SECONDS}.`,
    );
  }

  // PostgreSQL works out the window from its own clock rather than being told
  // it, so every instance agrees. The column has no time zone and Prisma reads
  // it as UTC, so the start is written as UTC too. Parameterised by the tagged
  // template.
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_counters" ("key", "windowStart", "count")
    VALUES (
      ${key},
      to_timestamp(
        floor(extract(epoch FROM clock_timestamp()) / ${windowSeconds}::integer)
          * ${windowSeconds}::integer
      ) AT TIME ZONE 'UTC',
      1
    )
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "rate_limit_counters"."count" + 1
    RETURNING "count"
  `;

  const count = rows[0]?.count;
  if (count === undefined) {
    throw new Error("Counting a rate-limit hit returned no row.");
  }

  if (Math.random() < SWEEP_PROBABILITY) {
    await sweepEndedCounters(db);
  }

  return count <= options.limit;
}

/**
 * Deletes counters whose window ended more than a day ago, so the table stays
 * bounded without a scheduled job. A row does not record its window length,
 * so the cut-off is a day plus the longest window before now: every row that
 * started earlier than that has ended at least a day ago, whatever its length.
 *
 * Housekeeping only: a failed sweep is logged and the request carries on, and
 * the rows it missed are left for the next one. If the database is down, the
 * count before it has already failed the request.
 */
async function sweepEndedCounters(db: RateLimitDatabase): Promise<void> {
  try {
    await db.$executeRaw`
      DELETE FROM "rate_limit_counters"
      WHERE "windowStart" < (clock_timestamp() AT TIME ZONE 'UTC')
        - ${MAX_WINDOW_SECONDS + RETAIN_AFTER_END_SECONDS}::integer * interval '1 second'
    `;
  } catch (error) {
    logError("rate_limit.sweep_failed", error);
  }
}
