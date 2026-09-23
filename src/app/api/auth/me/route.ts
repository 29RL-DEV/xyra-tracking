import type { NextRequest } from "next/server";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";

export const dynamic = "force-dynamic";

export const GET = handleRoute(async (_request: NextRequest) => {
  const session = await requireStaff();

  return jsonResponse({
    user: { id: session.userId, name: session.name, email: session.email },
  });
});
