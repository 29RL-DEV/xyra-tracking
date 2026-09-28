import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/lib/api/respond";
import { readStaffSession } from "@/lib/auth/require-staff";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Where a staff page sends a session whose token is validly signed but which
 * has ended on the server: signed out, past its recorded expiry, issued before
 * sessions were recorded, or belonging to an account that no longer exists.
 *
 * The cookie has to be cleared before the person reaches the sign-in page:
 * middleware checks only the signature, so it would send them straight back
 * into the staff area, and the page would send them out again. A page cannot
 * clear a cookie while it renders; a route handler can.
 *
 * A session that still works is left alone, so a link to this address cannot
 * sign anyone out.
 */
export const GET = handleRoute(async (request: NextRequest) => {
  const result = await readStaffSession();
  const login = new URL("/staff/login", request.url);

  // Only a staff path, the same rule the sign-in form applies before it follows it.
  const next = request.nextUrl.searchParams.get("next");
  if (next?.startsWith("/staff")) {
    login.searchParams.set("next", next);
  }

  if (result.state !== "valid") {
    await clearSessionCookie();
    login.searchParams.set("reason", "signed-out");
  }

  return NextResponse.redirect(login, {
    headers: { "Cache-Control": "no-store, private" },
  });
});
