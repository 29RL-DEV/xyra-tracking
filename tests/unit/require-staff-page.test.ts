import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { clearTestCookies, setTestCookie } from "../setup/test-env";

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

describe("requireStaffPage", () => {
  beforeEach(() => {
    clearTestCookies();
    redirectMock.mockClear();
  });

  it("resolves without redirecting when the session is valid", async () => {
    const token = await signSession({ userId: "x", email: "a@b.test", name: "A" });
    setTestCookie(SESSION_COOKIE, token);

    await expect(requireStaffPage("/staff")).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to login with next set to the given path when there is no session", async () => {
    await expect(requireStaffPage("/staff/shipments/abc")).rejects.toThrow();

    expect(redirectedTo()).toBe("/staff/login?next=%2Fstaff%2Fshipments%2Fabc");
  });

  it("marks an expired session distinctly from a missing one, matching middleware", async () => {
    const expired = await signSession({ userId: "x", email: "a@b.test", name: "A" }, -60);
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
