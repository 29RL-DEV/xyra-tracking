import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSessionSecret, isProduction } from "@/lib/env";

export const SESSION_COOKIE = "sid";

/** Eight hours: long enough for a working day, short enough to limit a leaked cookie. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export type SessionResult =
  | { state: "valid"; session: SessionPayload }
  | { state: "missing" }
  | { state: "expired" }
  | { state: "invalid" };

export async function signSession(
  payload: SessionPayload,
  expiresInSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(getSessionSecret());
}

/**
 * Verifies a token. Expiry is distinguished from a bad signature so the UI can
 * tell someone their session ran out rather than that something broke.
 */
export async function verifySession(token: string): Promise<SessionResult> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
    });

    const { userId, email, name } = payload as Partial<SessionPayload>;

    if (typeof userId !== "string" || typeof email !== "string" || typeof name !== "string") {
      return { state: "invalid" };
    }

    return { state: "valid", session: { userId, email, name } };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") {
      return { state: "expired" };
    }
    return { state: "invalid" };
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // Lax is what keeps a cross-site form from carrying the session into the
  // staff API, which parses JSON bodies without checking Content-Type. Strict
  // would also drop the cookie when someone follows a link into /staff.
  sameSite: "lax",
  path: "/",
} as const;

/** Reads and verifies the session on the current request. */
export async function readSession(): Promise<SessionResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { state: "missing" };
  }

  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clears with the same attributes used at issue, or the browser keeps the original. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
}
