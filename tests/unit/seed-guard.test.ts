import { describe, expect, it } from "vitest";
import {
  DEMO_STAFF_PASSWORD_FALLBACK,
  isLocalDatabaseUrl,
  planSeed,
  resolveSeedPassword,
  SeedRefusedError,
} from "../../prisma/seed-guard";

/**
 * The seed deletes every row before writing. These are the checks that stand
 * between that behaviour and a deployed database.
 */
describe("seed safety", () => {
  const local = "postgresql://postgres:postgres@127.0.0.1:5433/postgres";
  const neon =
    "postgresql://user:pw@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

  describe("recognising a local database", () => {
    it("accepts the loopback addresses used for development", () => {
      expect(isLocalDatabaseUrl(local)).toBe(true);
      expect(isLocalDatabaseUrl("postgresql://u:p@localhost:5432/db")).toBe(true);
      expect(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/db")).toBe(true);
    });

    it("treats a hosted database as non-local", () => {
      expect(isLocalDatabaseUrl(neon)).toBe(false);
      expect(isLocalDatabaseUrl("postgresql://u:p@db.internal.example.com/db")).toBe(false);
    });

    it("treats both Supabase connection strings as non-local", () => {
      // The production target: the seed must refuse both, including the
      // direct string the README tells you to seed with.
      const supabaseDirect =
        "postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
      const supabasePooled =
        "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

      expect(isLocalDatabaseUrl(supabaseDirect)).toBe(false);
      expect(isLocalDatabaseUrl(supabasePooled)).toBe(false);
      expect(() =>
        planSeed({ databaseUrl: supabaseDirect, allowDestructive: undefined }),
      ).toThrow(SeedRefusedError);
    });

    it("treats an unreadable connection string as non-local", () => {
      // If we cannot tell what we are about to erase, we ask first.
      expect(isLocalDatabaseUrl("not-a-url")).toBe(false);
      expect(isLocalDatabaseUrl("")).toBe(false);
    });
  });

  describe("deciding whether the run may proceed", () => {
    it("allows a local database with no ceremony", () => {
      const plan = planSeed({ databaseUrl: local, allowDestructive: undefined });

      expect(plan).toEqual({ databaseUrl: local, isLocal: true, overridden: false });
    });

    it("refuses a hosted database by default", () => {
      expect(() => planSeed({ databaseUrl: neon, allowDestructive: undefined })).toThrow(
        SeedRefusedError,
      );
    });

    it("is not satisfied by a value someone might set by accident", () => {
      for (const value of ["", "0", "false", "no", "true", "1", "maybe"]) {
        expect(() => planSeed({ databaseUrl: neon, allowDestructive: value })).toThrow(
          SeedRefusedError,
        );
      }
    });

    it("proceeds against a hosted database only with the explicit override", () => {
      const plan = planSeed({ databaseUrl: neon, allowDestructive: "yes" });

      expect(plan.overridden).toBe(true);
      expect(plan.isLocal).toBe(false);
    });

    it("refuses when it cannot tell which database it would erase", () => {
      expect(() => planSeed({ databaseUrl: undefined, allowDestructive: "yes" })).toThrow(
        SeedRefusedError,
      );
    });
  });

  describe("choosing the demo password", () => {
    const localPlan = { databaseUrl: local, isLocal: true, overridden: false };
    const hostedPlan = { databaseUrl: neon, isLocal: false, overridden: true };

    it("falls back to the published demo password only on a local database", () => {
      expect(resolveSeedPassword(undefined, localPlan)).toBe(DEMO_STAFF_PASSWORD_FALLBACK);
    });

    it("requires a supplied password for a hosted database", () => {
      expect(() => resolveSeedPassword(undefined, hostedPlan)).toThrow(SeedRefusedError);
      expect(() => resolveSeedPassword("   ", hostedPlan)).toThrow(SeedRefusedError);
    });
  });
});
