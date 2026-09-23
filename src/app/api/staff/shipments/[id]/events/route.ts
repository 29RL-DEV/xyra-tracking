import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import { addEvent } from "@/lib/services/event-service";
import { createEventSchema } from "@/lib/validation/event";

export const dynamic = "force-dynamic";

/**
 * Appends a tracking event. There is deliberately no PATCH or DELETE here:
 * the absence of those handlers is what makes the history append-only.
 */
export const POST = handleRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await requireStaff();

    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const input = createEventSchema.parse(body);

    const result = await addEvent(id, input, session.userId);

    return jsonResponse(result, 201);
  },
);
