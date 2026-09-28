import { NextResponse, type NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import { isCrossSiteRequest } from "@/lib/api/request";
import { handleRoute } from "@/lib/api/respond";
import { clearSessionCookie, readSession } from "@/lib/auth/session";
import { revokeSession } from "@/lib/services/auth-service";

export const dynamic = "force-dynamic";

/**
 * Idempotent: logging out when already logged out is not an error.
 *
 * It takes no body, so the JSON-only rule that keeps other sites' forms off
 * the other endpoints does not apply here. It checks the sender instead, so a
 * form on another site cannot sign an operator out in the middle of their work.
 *
 * The session is ended on the server as well as in the browser, so a copy of
 * the token stops working too. Only this session is ended: other people signed
 * in to the same account stay signed in. Only a token whose signature verifies
 * can name the session to end, so a forged one cannot sign anyone else out.
 */
export const POST = handleRoute(async (request: NextRequest) => {
  if (isCrossSiteRequest(request)) {
    throw errors.crossSiteRequest();
  }

  const current = await readSession();
  if (current.state === "valid" && current.sessionId) {
    await revokeSession(current.sessionId);
  }

  await clearSessionCookie();
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, private" },
  });
});
