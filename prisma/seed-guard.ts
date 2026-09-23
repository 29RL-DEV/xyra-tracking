/**
 * Safety rails for the seed script.
 *
 * Seeding clears every table before it writes. That is the right behaviour for
 * a demo database and a catastrophic one for a deployed database, and the
 * difference between them is a single environment variable that is easy to
 * have exported in the wrong terminal. These checks make the destructive path
 * something you have to ask for explicitly.
 */

export const DEMO_STAFF_PASSWORD_FALLBACK = "DemoStaff2026!";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/**
 * Whether a connection string points at a database on this machine.
 *
 * An unparseable URL is treated as non-local: if we cannot tell what we are
 * about to erase, we ask for confirmation rather than assume the safe case.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return LOCAL_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface SeedTarget {
  databaseUrl: string | undefined;
  /** The value of ALLOW_DESTRUCTIVE_SEED, if it was set. */
  allowDestructive: string | undefined;
}

export interface SeedPlan {
  databaseUrl: string;
  isLocal: boolean;
  /** True when a non-local database was allowed by an explicit override. */
  overridden: boolean;
}

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

/**
 * Decides whether this seed run may proceed.
 *
 * Local databases seed freely. Anything else needs ALLOW_DESTRUCTIVE_SEED=yes,
 * which is deliberately not a value anyone types by accident.
 */
export function planSeed({ databaseUrl, allowDestructive }: SeedTarget): SeedPlan {
  if (!databaseUrl) {
    throw new SeedRefusedError(
      "DATABASE_URL is not set. Refusing to seed a database I cannot identify.",
    );
  }

  const isLocal = isLocalDatabaseUrl(databaseUrl);

  if (isLocal) {
    return { databaseUrl, isLocal, overridden: false };
  }

  if (allowDestructive?.toLowerCase() !== "yes") {
    throw new SeedRefusedError(
      [
        "Refusing to seed a non-local database.",
        "",
        "Seeding deletes every shipment, event, note, enquiry and staff user",
        "before writing the demo data. DATABASE_URL does not point at",
        "localhost, so this would erase a deployed database.",
        "",
        "If that is genuinely what you want, re-run with:",
        "  ALLOW_DESTRUCTIVE_SEED=yes",
      ].join("\n"),
    );
  }

  return { databaseUrl, isLocal, overridden: true };
}

/**
 * The password given to the demo account.
 *
 * A local database may fall back to the password published in the README,
 * because that is the point of a demo. A deployed one may not: a known
 * password on an internet-facing staff console is a different thing entirely.
 */
export function resolveSeedPassword(
  password: string | undefined,
  plan: SeedPlan,
): string {
  const supplied = password?.trim();

  if (supplied) return supplied;

  if (!plan.isLocal) {
    throw new SeedRefusedError(
      [
        "SEED_STAFF_PASSWORD is required when seeding a non-local database.",
        "",
        "Refusing to create the demo account with the password published in",
        "the README on a database that is not on this machine.",
      ].join("\n"),
    );
  }

  return DEMO_STAFF_PASSWORD_FALLBACK;
}
