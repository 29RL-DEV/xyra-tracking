/**
 * Tracking numbers.
 *
 * The accepted format is deliberately permissive: a customer retyping a number
 * from a label should not be rejected for case or for a carrier prefix we did
 * not anticipate. The server re-applies this rule on every entry point.
 */

export const TRACKING_NUMBER_PATTERN = /^[A-Z0-9-]{6,40}$/;

/**
 * Alphabet for generated numbers. 0/O, 1/I and L/U are excluded because
 * tracking numbers get read aloud and retyped, and those collisions are a real
 * support cost.
 */
const GENERATED_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const GENERATED_LENGTH = 6;

/** Upper-cases and trims. Lookup is case-insensitive everywhere. */
export function normaliseTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidTrackingNumber(value: string): boolean {
  return TRACKING_NUMBER_PATTERN.test(normaliseTrackingNumber(value));
}

/**
 * A uniformly distributed integer in [0, max) from a cryptographically secure
 * source, so the next generated number cannot be predicted from earlier ones.
 *
 * Web Crypto rather than `node:crypto`: this module is also bundled for the
 * browser, where the search form imports its pattern, and `getRandomValues` is
 * available in both. Rejection sampling keeps every character equally likely.
 */
function secureRandomInt(max: number): number {
  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const buffer = new Uint32Array(1);

  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return value % max;
  }
}

/**
 * Generates a candidate of the form TRK-XXXXXX. Uniqueness is checked by the
 * caller. The format is fixed by the specification; resistance to guessing
 * comes from the unpredictable source above and the rate limit on lookups.
 */
export function generateTrackingNumber(
  randomInt: (max: number) => number = secureRandomInt,
): string {
  let suffix = "";

  for (let i = 0; i < GENERATED_LENGTH; i += 1) {
    suffix += GENERATED_ALPHABET.charAt(randomInt(GENERATED_ALPHABET.length));
  }

  return `TRK-${suffix}`;
}
