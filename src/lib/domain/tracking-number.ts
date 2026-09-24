/**
 * Tracking numbers.
 *
 * Lookup is deliberately permissive: a customer retyping a number from a label
 * should not be rejected for case or for a carrier prefix we did not
 * anticipate. The server re-applies this rule on every entry point.
 *
 * New shipments are stricter: every number this application issues is
 * TRK-DEMO- followed by digits, padded to at least three (TRK-DEMO-007).
 */

export const TRACKING_NUMBER_PATTERN = /^[A-Z0-9-]{6,40}$/;

export const TRACKING_NUMBER_PREFIX = "TRK-DEMO-";

/** What a new shipment's number may be: the prefix and one to six digits. */
export const NEW_TRACKING_NUMBER_PATTERN = /^TRK-DEMO-(\d{1,6})$/;

/** The digits an operator types after the prefix. */
export const TRACKING_DIGITS_PATTERN = /^\d{1,6}$/;

const MIN_DIGITS = 3;

/** Upper-cases and trims. Lookup is case-insensitive everywhere. */
export function normaliseTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidTrackingNumber(value: string): boolean {
  return TRACKING_NUMBER_PATTERN.test(normaliseTrackingNumber(value));
}

/** "7" and "007" name the same shipment, so both become TRK-DEMO-007. */
export function trackingNumberFromDigits(digits: string): string {
  return `${TRACKING_NUMBER_PREFIX}${String(Number(digits)).padStart(MIN_DIGITS, "0")}`;
}

/**
 * The number after the highest one already issued, so numbers follow on from
 * each other. Numbers in any other format are ignored.
 */
export function nextTrackingNumber(existing: readonly string[]): string {
  let highest = 0;

  for (const trackingNumber of existing) {
    const digits = NEW_TRACKING_NUMBER_PATTERN.exec(trackingNumber)?.[1];
    if (digits) highest = Math.max(highest, Number(digits));
  }

  return trackingNumberFromDigits(String(highest + 1));
}
