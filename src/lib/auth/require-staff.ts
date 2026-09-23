import { redirect } from "next/navigation";
import { errors } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { clearSessionCookie, readSession, type SessionPayload } from "./session";

/**
 * The application's principal access control.
 *
 * Every handler under /api/staff calls this before parsing parameters or
 * touching the database. One shared function means the check cannot drift
 * between endpoints, and a missing call is visible in review.
 *
 * A signature alone is not enough: the account the token names must still
 * exist. Without this, a session issued before the database was re-seeded
 * would pass every check and then fail inside a write with a foreign-key
 * error. Instead the stale cookie is cleared and the request is refused, so
 * the browser returns the person to sign-in.
 *
 * Throws, so it composes with handleRoute's error boundary.
 */
export async function requireStaff(): Promise<SessionPayload> {
  const result = await readSession();

  switch (result.state) {
    case "valid": {
      const account = await prisma.staffUser.findUnique({
        where: { id: result.session.userId },
        select: { id: true },
      });

      if (!account) {
        await clearSessionCookie();
        throw errors.unauthenticated();
      }

      return result.session;
    }
    case "expired":
      throw errors.sessionExpired();
    default:
      throw errors.unauthenticated();
  }
}

/**
 * Session guard for a server-rendered staff page that reads protected data
 * directly — internal notes included — instead of going through the API.
 *
 * Middleware already redirects an unauthenticated request before any staff
 * page renders; this is the defence-in-depth backstop for the pages that hold
 * the most sensitive data, in case that ever changes. It mirrors middleware's
 * own redirect exactly (same `next` and `reason=expired` convention) so the
 * two are indistinguishable to the person being redirected.
 *
 * `pathname` is supplied by the caller: a page has no request object to read
 * it from the way middleware does. It is always one of this application's own
 * static or param-built staff paths, never user input, so the redirect can
 * carry it as `next` without the open-redirect risk that trusting an arbitrary
 * value would introduce — the login form additionally rejects any `next` that
 * does not start with `/staff` before it navigates anywhere.
 *
 * Must be called before any try/catch that would swallow a thrown redirect.
 */
export async function requireStaffPage(pathname: string): Promise<void> {
  const result = await readSession();

  if (result.state === "valid") {
    return;
  }

  const params = new URLSearchParams({ next: pathname });
  if (result.state === "expired") {
    params.set("reason", "expired");
  }

  redirect(`/staff/login?${params.toString()}`);
}
