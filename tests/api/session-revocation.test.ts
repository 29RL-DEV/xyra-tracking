import { decodeJwt, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listShipments } from "@/app/api/staff/shipments/route";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSessionSecret } from "@/lib/env";
import { startSession } from "@/lib/services/auth-service";
import { get, readJson, send, type ErrorBody } from "../helpers/request";
import {
  resetDatabase,
  seedFixtures,
  signIn,
  TEST_STAFF,
  type Fixtures,
} from "../helpers/fixtures";
import { getTestCookie, setTestCookie } from "../setup/test-env";

/** As in the page-guard tests: a redirect throws, so rendering stops. */
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

/** Signs in through the real endpoint and returns the token it issued. */
async function signInThroughLogin(): Promise<string> {
  const response = await login(
    send("/api/auth/login", "POST", {
      email: TEST_STAFF.email,
      password: TEST_STAFF.password,
    }),
  );

  expect(response.status).toBe(200);
  return getTestCookie(SESSION_COOKIE)!;
}

/** Presents a token, as a copied cookie would be, and returns the API's answer. */
async function meWith(token: string): Promise<{ status: number; code?: string }> {
  setTestCookie(SESSION_COOKIE, token);
  const response = await me(get("/api/auth/me"));

  return response.status === 200
    ? { status: 200 }
    : { status: response.status, code: (await readJson<ErrorBody>(response)).error.code };
}

function sessionIdOf(token: string): string {
  return decodeJwt(token).sessionId as string;
}

let fixtures: Fixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedFixtures();
  redirectMock.mockClear();
});

describe("server-side session revocation", () => {
  it("ends the session on the server at sign-out, so a copy of the token stops working", async () => {
    const token = await signInThroughLogin();
    expect((await listShipments(get("/api/staff/shipments"))).status).toBe(200);

    expect((await logout(send("/api/auth/logout", "POST"))).status).toBe(204);
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();

    // The copy's signature is still valid, which used to be all it needed.
    setTestCookie(SESSION_COOKIE, token);
    const api = await listShipments(get("/api/staff/shipments"));
    expect(api.status).toBe(401);
    expect((await readJson<ErrorBody>(api)).error.code).toBe("UNAUTHENTICATED");
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();

    setTestCookie(SESSION_COOKIE, token);
    await expect(requireStaffPage("/staff")).rejects.toThrow(
      "REDIRECT:/api/auth/session-ended?next=%2Fstaff",
    );

    // Signing out again, with the ended token or with none, is not an error.
    expect((await logout(send("/api/auth/logout", "POST"))).status).toBe(204);
    expect((await logout(send("/api/auth/logout", "POST"))).status).toBe(204);

    const fresh = await signInThroughLogin();
    expect(fresh).not.toBe(token);
    expect(await meWith(fresh)).toEqual({ status: 200 });
  });

  it("leaves the account's other sessions signed in", async () => {
    const mine = await signInThroughLogin();
    const colleagues = await signInThroughLogin();

    setTestCookie(SESSION_COOKIE, mine);
    expect((await logout(send("/api/auth/logout", "POST"))).status).toBe(204);

    expect(await meWith(mine)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(await meWith(colleagues)).toEqual({ status: 200 });
  });

  it("refuses a token whose recorded session was revoked, has expired or is gone", async () => {
    // All issued before any row is changed: a sign-in clears the account's
    // ended rows, which would turn "revoked" and "expired" into "gone".
    const revoked = await signIn(fixtures.staffId);
    const expired = await signIn(fixtures.staffId);
    const gone = await signIn(fixtures.staffId);

    await prisma.staffSession.update({
      where: { id: sessionIdOf(revoked) },
      data: { revokedAt: new Date() },
    });
    // The token itself has hours left; only the recorded expiry has passed.
    await prisma.staffSession.update({
      where: { id: sessionIdOf(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.staffSession.delete({ where: { id: sessionIdOf(gone) } });

    for (const token of [revoked, expired, gone]) {
      expect(await meWith(token)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
      expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
    }

    // The next sign-in removes the rows that can never be used again.
    await signIn(fixtures.staffId);
    expect(
      await prisma.staffSession.count({
        where: { id: { in: [sessionIdOf(revoked), sessionIdOf(expired)] } },
      }),
    ).toBe(0);
  });

  it("refuses a validly signed token that names no recorded session, as issued before this change", async () => {
    const legacy = await new SignJWT({
      userId: fixtures.staffId,
      email: TEST_STAFF.email,
      name: TEST_STAFF.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getSessionSecret());

    expect(await meWith(legacy)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();

    setTestCookie(SESSION_COOKIE, legacy);
    await expect(requireStaffPage()).rejects.toThrow("REDIRECT:/api/auth/session-ended");
  });

  it("still judges the token itself before its recorded session", async () => {
    // A live session, so only the token's own signature and expiry are at fault.
    const claims = {
      userId: fixtures.staffId,
      email: TEST_STAFF.email,
      name: TEST_STAFF.name,
      sessionId: await startSession(fixtures.staffId),
    };

    const otherSecret = new TextEncoder().encode("another-secret-that-is-also-at-least-32-chars");
    const forged = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(otherSecret);

    expect(await meWith(forged)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(await meWith(await signSession(claims, -60))).toEqual({
      status: 401,
      code: "SESSION_EXPIRED",
    });
  });
});
