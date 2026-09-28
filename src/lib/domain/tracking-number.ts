/**
 * Tracking numbers.
 *
 * A tracking number is all anyone needs to look a shipment up, so it must not
 * be guessable from another one. Every shipment created in the application gets
 * TRK- followed by 16 characters from a cryptographically secure random source:
 * 80 bits, so working through the space is not a practical way to find
 * shipments, whatever the rate limits allow. The demo shipments keep the
 * sequential TRK-DEMO- numbers they were seeded with, so existing links work.
 *
 * Lookup is deliberately permissive: a customer retyping a number from a label
 * should not be rejected for case or for a carrier prefix we did not
 * anticipate. The server re-applies this rule on every entry point.
 */

export const TRACKING_NUMBER_PATTERN = /^[A-Z0-9-]{6,40}$/;

/**
 * Crockford's base32 alphabet. It leaves out I, L, O and U, so a number read
 * off a label cannot be mistyped as a similar-looking character. With 32
 * symbols, each character carries exactly 5 random bits.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_CHARACTERS = 16;

/** The shape of every number generateTrackingNumber issues. */
export const GENERATED_TRACKING_NUMBER_PATTERN = /^TRK-[0-9A-HJKMNP-TV-Z]{16}$/;

/** Upper-cases and trims. Lookup is case-insensitive everywhere. */
export function normaliseTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidTrackingNumber(value: string): boolean {
  return TRACKING_NUMBER_PATTERN.test(normaliseTrackingNumber(value));
}

/**
 * A new tracking number. Nothing about it depends on the shipment, the time or
 * any other number issued: every character comes from the platform's
 * cryptographically secure random source.
 */
export function generateTrackingNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_CHARACTERS));

  // 256 is a multiple of 32, so the low five bits of a byte are uniformly
  // distributed and no character is more likely than another.
  return `TRK-${Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("")}`;
}
