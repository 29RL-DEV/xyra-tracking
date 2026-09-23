import { afterAll, vi } from "vitest";

/**
 * A controllable stand-in for Next's request-scoped cookie store, so route
 * handlers can be exercised directly with and without a session.
 *
 * The options passed to `set` are recorded as well as the value, which is what
 * lets the authentication tests assert the session cookie is hardened.
 */
export interface RecordedCookie {
  value: string;
  options: Record<string, unknown>;
}

const { cookieJar } = vi.hoisted(() => ({
  cookieJar: new Map<string, { value: string; options: Record<string, unknown> }>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (value === "") {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, { value, options });
      }
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

export function setTestCookie(name: string, value: string): void {
  cookieJar.set(name, { value, options: {} });
}

export function clearTestCookies(): void {
  cookieJar.clear();
}

export function getTestCookie(name: string): string | undefined {
  return cookieJar.get(name)?.value;
}

export function getTestCookieOptions(
  name: string,
): Record<string, unknown> | undefined {
  return cookieJar.get(name)?.options;
}

// Release the database connection pool when a test file finishes, so the run
// exits cleanly instead of hanging on an open handle. Component tests run in
// jsdom and never touch the database, so they skip this entirely.
afterAll(async () => {
  if (typeof window !== "undefined") return;

  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
});
