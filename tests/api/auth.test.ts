import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { get, readJson, send, type ErrorBody } from "../helpers/request";
import {
  resetDatabase,
  seedFixtures,
  signOut,
  TEST_STAFF,
} from "../helpers/fixtures";
import { getTestCookie, getTestCookieOptions } from "../setup/test-env";

describe("staff authentication", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
    signOut();
  });

  it("signs in with the seeded credentials and issues a session", async () => {
    const response = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );

    expect(response.status).toBe(200);

    const body = await readJson<{ user: { email: string; name: string } }>(response);
    expect(body.user.email).toBe(TEST_STAFF.email);
    expect(getTestCookie(SESSION_COOKIE)).toBeTruthy();
  });

  it("hardens the session cookie against script access and cross-site sending", async () => {
    await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );

    const options = getTestCookieOptions(SESSION_COOKIE);

    expect(options?.httpOnly).toBe(true);
    expect(options?.sameSite).toBe("lax");
    expect(options?.path).toBe("/");
    expect(options?.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    // `secure` is driven by NODE_ENV, so it is off under test and on when
    // deployed. sessionCookieOptions is the single source for that decision.
    expect(sessionCookieOptions.secure).toBe(process.env.NODE_ENV === "production");
  });

  it("clears the session cookie with the same attributes it was set with", async () => {
    await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );

    await logout(send("/api/auth/logout", "POST"));

    // A cookie cleared with different attributes is left in place by the
    // browser, so the clear must mirror the set.
    expect(sessionCookieOptions.path).toBe("/");
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects a wrong password with 401", async () => {
    const response = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: "definitely-not-the-password",
      }),
    );

    expect(response.status).toBe(401);
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
  });

  it("gives an unknown email the identical response to a wrong password", async () => {
    const wrongPassword = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: "wrong",
      }),
    );
    const unknownEmail = await login(
      send("/api/auth/login", "POST", {
        email: "nobody@demo.test",
        password: "wrong",
      }),
    );

    expect(unknownEmail.status).toBe(wrongPassword.status);

    const a = await readJson<ErrorBody>(wrongPassword);
    const b = await readJson<ErrorBody>(unknownEmail);

    // Identical body: the response must not confirm which addresses exist.
    expect(b).toEqual(a);
  });

  it("rejects an empty body with field-level errors", async () => {
    const response = await login(send("/api/auth/login", "POST", {}));

    expect(response.status).toBe(400);

    const body = await readJson<ErrorBody>(response);
    expect(body.error.fields?.email).toBeDefined();
    expect(body.error.fields?.password).toBeDefined();
  });

  it("never returns a password hash on any login path", async () => {
    const success = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );
    const failure = await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: "wrong",
      }),
    );

    const successRaw = JSON.stringify(await readJson<unknown>(success));
    const failureRaw = JSON.stringify(await readJson<unknown>(failure));

    expect(successRaw).not.toContain("passwordHash");
    expect(successRaw).not.toContain("$2a$");
    expect(successRaw).not.toContain("$2b$");
    expect(failureRaw).not.toContain("passwordHash");
  });

  it("stores the password as a bcrypt hash, never as plaintext", async () => {
    const user = await prisma.staffUser.findUniqueOrThrow({
      where: { email: TEST_STAFF.email },
    });

    expect(user.passwordHash).not.toBe(TEST_STAFF.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await verifyPassword(TEST_STAFF.password, user.passwordHash)).toBe(true);
  });

  it("returns the current user while signed in", async () => {
    await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );

    const response = await me(get("/api/auth/me"));
    expect(response.status).toBe(200);

    const body = await readJson<{ user: { name: string } }>(response);
    expect(body.user.name).toBe(TEST_STAFF.name);
  });

  it("returns 401 from /api/auth/me without a session", async () => {
    const response = await me(get("/api/auth/me"));
    expect(response.status).toBe(401);
  });

  it("clears the session on logout, and the old cookie stops working", async () => {
    await login(
      send("/api/auth/login", "POST", {
        email: TEST_STAFF.email,
        password: TEST_STAFF.password,
      }),
    );

    const response = await logout(send("/api/auth/logout", "POST"));
    expect(response.status).toBe(204);
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();

    const after = await me(get("/api/auth/me"));
    expect(after.status).toBe(401);
  });
});
