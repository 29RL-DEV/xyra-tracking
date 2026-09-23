import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import {
  LOGIN_IDENTITY_RATE_LIMIT,
  LOGIN_CLIENT_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getTestCookie } from "../setup/test-env";
import { readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signOut, TEST_STAFF } from "../helpers/fixtures";

/**
 * Sign-in throttling.
 *
 * The control only has value if a wrong password actually stops working after
 * a few attempts, and only has an acceptable cost if a legitimate operator is
 * never shut out. Both halves are asserted here against the real handler.
 */

function attempt(email: string, password: string, client = "198.51.100.7") {
  return login(
    send("/api/auth/login", "POST", { email, password }, { "x-forwarded-for": client }),
  );
}

async function failUntilBlocked(email: string, client?: string): Promise<number> {
  for (let i = 0; i < LOGIN_IDENTITY_RATE_LIMIT.limit + 5; i += 1) {
    const response = await attempt(email, "definitely-not-the-password", client);
    if (response.status === 429) return i + 1;
  }

  throw new Error("never blocked");
}

describe("sign-in throttling", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
    signOut();
  });

  it("blocks further attempts against one account after repeated failures", async () => {
    const attempts = await failUntilBlocked(TEST_STAFF.email);

    expect(attempts).toBe(LOGIN_IDENTITY_RATE_LIMIT.limit + 1);
  });

  it("keeps rejecting the correct password while the client is blocked", async () => {
    await failUntilBlocked(TEST_STAFF.email);

    const response = await attempt(TEST_STAFF.email, TEST_STAFF.password);

    expect(response.status).toBe(429);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("TOO_MANY_ATTEMPTS");
    // No session is issued to a blocked client.
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
  });

  it("says the same thing whether or not the account exists", async () => {
    const known = await failUntilBlocked(TEST_STAFF.email, "203.0.113.1");
    const unknown = await failUntilBlocked("nobody@demo.test", "203.0.113.2");

    expect(unknown).toBe(known);

    const knownBody = await readJson<ErrorBody>(
      await attempt(TEST_STAFF.email, "x", "203.0.113.1"),
    );
    const unknownBody = await readJson<ErrorBody>(
      await attempt("nobody@demo.test", "x", "203.0.113.2"),
    );

    expect(unknownBody.error).toEqual(knownBody.error);
  });

  it("does not lock out an operator who mistypes and then gets it right", async () => {
    for (let i = 0; i < LOGIN_IDENTITY_RATE_LIMIT.limit - 1; i += 1) {
      const response = await attempt(TEST_STAFF.email, "wrong-password");
      expect(response.status).toBe(401);
    }

    const success = await attempt(TEST_STAFF.email, TEST_STAFF.password);
    expect(success.status).toBe(200);
    expect(getTestCookie(SESSION_COOKIE)).toBeDefined();
  });

  it("forgets the failures once a sign-in succeeds", async () => {
    for (let i = 0; i < LOGIN_IDENTITY_RATE_LIMIT.limit - 1; i += 1) {
      await attempt(TEST_STAFF.email, "wrong-password");
    }

    expect((await attempt(TEST_STAFF.email, TEST_STAFF.password)).status).toBe(200);

    // The counter restarted, so the whole allowance is available again.
    for (let i = 0; i < LOGIN_IDENTITY_RATE_LIMIT.limit; i += 1) {
      expect((await attempt(TEST_STAFF.email, "wrong-password")).status).toBe(401);
    }
  });

  it("throttles one account without blocking a different client", async () => {
    await failUntilBlocked(TEST_STAFF.email, "198.51.100.10");

    const other = await attempt(TEST_STAFF.email, TEST_STAFF.password, "198.51.100.11");

    expect(other.status).toBe(200);
  });

  it("limits a single client working through many accounts", async () => {
    const client = "198.51.100.200";
    let blocked = 0;

    // Each address gets its own identity bucket, so only the wider per-client
    // bucket can stop this pattern.
    for (let i = 0; i < LOGIN_CLIENT_RATE_LIMIT.limit + 2; i += 1) {
      const response = await attempt(`person${i}@demo.test`, "guess", client);
      if (response.status === 429) blocked += 1;
    }

    expect(blocked).toBeGreaterThan(0);
  });
});
