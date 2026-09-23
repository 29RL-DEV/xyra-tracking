/**
 * A small in-memory rate limiter for the unauthenticated entry points that
 * need one: tracking lookups, enquiry submission and sign-in.
 *
 * Deliberately not backed by a shared store: this is a demo application and a
 * Redis dependency would be more infrastructure than the task calls for. The
 * consequence is that the limit is per serverless instance rather than global,
 * which is recorded as a limitation in the README rather than overstated here.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const ENQUIRY_RATE_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
};

/**
 * Public tracking lookups, through the API and the /track page alike.
 *
 * Thirty a minute is far beyond anyone checking their own parcels, and far
 * below what working through the tracking-number space would need. Every
 * lookup counts, found or not, so probing the format costs the same as
 * probing for shipments.
 */
export const TRACKING_LOOKUP_RATE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowMs: 60 * 1000,
};

export function trackingLookupKey(client: string): string {
  return `track:${client}`;
}

/**
 * Sign-in throttling.
 *
 * Two buckets, both counting failures only, so someone typing their password
 * wrong a few times and then getting it right is never locked out: a success
 * clears both counters.
 *
 * Both keys include the client address. A per-account bucket that ignored the
 * address would let anyone lock the demo operator out of their own account
 * from anywhere, which trades a brute-force risk for a denial-of-service one.
 * The narrower bucket therefore limits attempts against one account from one
 * address, and the wider one limits an address working through many accounts.
 */
export const LOGIN_IDENTITY_RATE_LIMIT: RateLimitOptions = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

export const LOGIN_CLIENT_RATE_LIMIT: RateLimitOptions = {
  limit: 15,
  windowMs: 15 * 60 * 1000,
};

/**
 * Drops buckets whose window has closed.
 *
 * Without this the map keeps one entry per client address for the lifetime of
 * the process, which is a slow memory leak on a long-running server.
 */
function evictExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): { allowed: boolean; remaining: number } {
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Cheap at this scale, and it keeps the map bounded by the number of
    // clients actually active within one window.
    evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1 };
  }

  if (bucket.count >= options.limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: options.limit - bucket.count };
}

/**
 * Reads a bucket without consuming from it.
 *
 * Sign-in needs to ask "is this client blocked?" before spending a bcrypt
 * comparison, and then decide separately whether the attempt counts against
 * the limit — which only a failure does.
 */
export function isRateLimited(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    return false;
  }

  return bucket.count >= options.limit;
}

/**
 * Counts one failed attempt against a key. The count stops at the limit, so a
 * client hammering a blocked key cannot extend its own window.
 */
export function recordFailure(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): void {
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (bucket.count < options.limit) {
    bucket.count += 1;
  }
}

/** Forgets a key's failures. Called after a successful sign-in. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test helper. Not used by application code. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test helper: how many buckets are currently held. */
export function rateLimitBucketCount(): number {
  return buckets.size;
}
