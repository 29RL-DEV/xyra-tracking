/**
 * Environment access.
 *
 * Values are read lazily so that `next build` succeeds without runtime secrets,
 * while any request path that genuinely needs one fails fast with a named error
 * rather than falling back to an insecure default.
 */

function required(name: string, minLength = 1): string {
  const value = process.env[name];

  if (!value || value.length < minLength) {
    throw new Error(
      `Missing or invalid environment variable: ${name}. ` +
        `See .env.example for the expected value.`,
    );
  }

  return value;
}

export function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(required("SESSION_SECRET", 32));
}

export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export const isProduction = process.env.NODE_ENV === "production";
