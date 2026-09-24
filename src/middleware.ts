import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Server-side page protection for the staff area.
 *
 * The first line of defence for the staff area: it runs on every request
 * under /staff, including client-side navigations that would not re-run the
 * protected layout. The pages that read the most sensitive data directly —
 * internal notes included — also call requireStaffPage() themselves, so that
 * data does not depend on this alone; the rest rely on this plus the API's own
 * requireStaff() for anything they fetch.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : { state: "missing" as const };
  const authenticated = session.state === "valid";

  if (pathname === "/staff/login") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/staff", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL("/staff/login", request.url);
    // Return the person to where they were heading once they sign in.
    loginUrl.searchParams.set("next", pathname);
    if (session.state === "expired") {
      loginUrl.searchParams.set("reason", "expired");
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*"],
};
