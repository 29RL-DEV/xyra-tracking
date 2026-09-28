import { redirect } from "next/navigation";
import { errors } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import {
  clearSessionCookie,
  readSession,
  type SessionPayload,
  type SessionResult,
} from "./session";

/**
 * Where a staff page sends a session that has ended on the server, to have its
 * cookie cleared. See the route for why a page cannot do that itself.
 */
export const SESSION_ENDED_PATH = "/api/auth/session-ended";

export type StaffSessionResult = SessionResult | { state: "removed" };

/**
 * The current session, checked against the database as well as its signature.
 *
 * A signature alone is not enough: it stays valid until the token expires. The
 * recorded session the token names must still be live — not signed out, not
 * past its expiry — and belong to the account the token names. The row cannot
 * outlive its account, so this one query also turns away a session whose
 * account was deleted, for example by a re-seed. Anything else, including a
 * token issued before sessions were recorded, is reported as "removed" rather
 * than valid. Every staff check, for the API and for pages, goes through here,
 * so the two cannot disagree.
 */
export async function readStaffSession(): Promise<StaffSessionResult> {
  const result = await readSession();

  if (result.state !== "valid") {
    return result;
  }

  if (!result.sessionId) {
    return { state: "removed" };
  }

  const live = await prisma.staffSession.findUnique({
    where: {
      id: result.sessionId,
      staffUserId: result.session.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  return live ? result : { state: "removed" };
}

/**
 * The application's principal access control.
 *
 * Every handler under /api/staff calls this before parsing parameters or
 * touching the database. One shared function means the check cannot drift
 * between endpoints, and a missing call is visible in review.
 *
 * A session that was signed out, or whose account no longer exists, would
 * otherwise pass every check, and the latter would then fail inside a write
 * with a foreign-key error. Instead the stale cookie is cleared and the
 * request is refused, so the browser returns the person to sign-in.
 *
 * Throws, so it composes with handleRoute's error boundary.
 */
export async function requireStaff(): Promise<SessionPayload> {
  const result = await readStaffSession();

  switch (result.state) {
    case "valid":
      return result.session;
    case "removed":
      await clearSessionCookie();
      throw errors.unauthenticated();
    case "expired":
      throw errors.sessionExpired();
    default:
      throw errors.unauthenticated();
  }
}

/**
 * Session guard for server-rendered staff pages: the protected layout, and the
 * pages that read protected data directly — internal notes included — instead
 * of going through the API.
 *
 * Middleware already redirects an unauthenticated request before any staff
 * page renders, but it checks only the token's signature: it cannot reach the
 * database. This is where a session that was signed out, or whose account has
 * been deleted, is turned away. For the other cases it mirrors middleware's
 * own redirect exactly (same `next` and `reason=expired` convention), so the
 * two are indistinguishable to the person being redirected.
 *
 * `pathname` is supplied by the caller: a page has no request object to read
 * it from the way middleware does. It is always one of this application's own
 * static or param-built staff paths, never user input, so the redirect can
 * carry it as `next` without the open-redirect risk that trusting an arbitrary
 * value would introduce — the login form additionally rejects any `next` that
 * does not start with `/staff` before it navigates anywhere. The layout, which
 * does not know which page it wraps, leaves it out.
 *
 * Must be called before any try/catch that would swallow a thrown redirect.
 */
export async function requireStaffPage(pathname?: string): Promise<SessionPayload> {
  const result = await readStaffSession();

  if (result.state === "valid") {
    return result.session;
  }

  const params = new URLSearchParams(pathname ? { next: pathname } : {});

  // The token is validly signed, so the sign-in page would send it straight
  // back into the staff area. It has to be cleared first, and a page cannot
  // clear a cookie while it renders.
  if (result.state === "removed") {
    redirect(withQuery(SESSION_ENDED_PATH, params));
  }

  if (result.state === "expired") {
    params.set("reason", "expired");
  }

  redirect(withQuery("/staff/login", params));
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
