import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startSession } from "@/lib/services/auth-service";
import { clearTestCookies, getTestCookie, setTestCookie } from "../setup/test-env";

/**
 * `redirect()` throws in real Next.js so rendering stops; the mock does the
 * same, so a test that forgets to await/expect the throw fails loudly instead
 * of silently passing with a call that was never asserted.
 */
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

function redirectedTo(): string {
  expect(redirectMock).toHaveBeenCalledOnce();
  return redirectMock.mock.calls[0]![0] as string;
}

const ACCOUNT_EMAIL = "page-guard@demo.test";

/** A signed, recorded session for an account that exists in the database. */
async function signInAsNewAccount(): Promise<string> {
  const account = await prisma.staffUser.create({
    data: { email: ACCOUNT_EMAIL, name: "Page Guard", passwordHash: "x" },
  });
  const token = await signSession({
    userId: account.id,
    email: ACCOUNT_EMAIL,
    name: "Page Guard",
    sessionId: await startSession(account.id),
  });
  setTestCookie(SESSION_COOKIE, token);

  return account.id;
}

describe("requireStaffPage", () => {
  beforeEach(() => {
    clearTestCookies();
    redirectMock.mockClear();
  });

  afterEach(async () => {
    await prisma.staffUser.deleteMany({ where: { email: ACCOUNT_EMAIL } });
  });

  it("returns the session without redirecting when it is valid and its account exists", async () => {
    await signInAsNewAccount();

    await expect(requireStaffPage("/staff")).resolves.toMatchObject({ email: ACCOUNT_EMAIL });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sends a validly signed session whose account was deleted to have its cookie cleared", async () => {
    const accountId = await signInAsNewAccount();
    await prisma.staffUser.delete({ where: { id: accountId } });

    // Rendering stops here, before the page reads any staff data.
    await expect(requireStaffPage("/staff/shipments/abc")).rejects.toThrow();

    // Not straight to sign-in: the cookie is still there, and middleware would
    // send its valid signature from sign-in back into the staff area.
    expect(redirectedTo()).toBe("/api/auth/session-ended?next=%2Fstaff%2Fshipments%2Fabc");
    expect(getTestCookie(SESSION_COOKIE)).toBeTruthy();
  });

  it("sends the layout, which names no page, to the same place without a next path", async () => {
    const accountId = await signInAsNewAccount();
    await prisma.staffUser.delete({ where: { id: accountId } });

    await expect(requireStaffPage()).rejects.toThrow();

    expect(redirectedTo()).toBe("/api/auth/session-ended");
  });

  it("redirects to login with next set to the given path when there is no session", async () => {
    await expect(requireStaffPage("/staff/shipments/abc")).rejects.toThrow();

    expect(redirectedTo()).toBe("/staff/login?next=%2Fstaff%2Fshipments%2Fabc");
  });

  it("marks an expired session distinctly from a missing one, matching middleware", async () => {
    const expired = await signSession(
      { userId: "x", email: "a@b.test", name: "A", sessionId: "x" },
      -60,
    );
    setTestCookie(SESSION_COOKIE, expired);

    await expect(requireStaffPage("/staff")).rejects.toThrow();

    expect(redirectedTo()).toBe("/staff/login?next=%2Fstaff&reason=expired");
  });

  it("rejects a tampered token the same way as a missing one", async () => {
    setTestCookie(SESSION_COOKIE, "not.a.valid.token");

    await expect(requireStaffPage("/staff")).rejects.toThrow();

    const url = redirectedTo();
    expect(url).toContain("next=%2Fstaff");
    expect(url).not.toContain("reason=");
  });
});
