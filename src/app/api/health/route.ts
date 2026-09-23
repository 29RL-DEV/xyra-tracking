import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

/**
 * Liveness and readiness for an external uptime monitor.
 *
 * 200 when the application is serving and the database answers; 503 when it
 * does not. The body says which, and nothing else — no version, host or
 * configuration detail for an anonymous caller to collect.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" }, { headers: NO_STORE });
  } catch (error) {
    logError("health.database_unreachable", error);
    return NextResponse.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
