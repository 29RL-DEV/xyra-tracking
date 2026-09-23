import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import { addNote } from "@/lib/services/note-service";
import { createNoteSchema } from "@/lib/validation/note";

export const dynamic = "force-dynamic";

export const POST = handleRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await requireStaff();

    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const input = createNoteSchema.parse(body);

    // Authorship comes from the verified session, never from the body.
    const note = await addNote(id, input, session.userId);

    return jsonResponse({ note }, 201);
  },
);
