import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/lib/api/respond";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Idempotent: logging out when already logged out is not an error. */
export const POST = handleRoute(async (_request: NextRequest) => {
  await clearSessionCookie();
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, private" },
  });
});
