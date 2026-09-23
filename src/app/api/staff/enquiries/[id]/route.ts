import { NextResponse, type NextRequest } from "next/server";
import { parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import { deleteEnquiry, setEnquiryStatus } from "@/lib/services/enquiry-service";
import { updateEnquirySchema } from "@/lib/validation/enquiry";

export const dynamic = "force-dynamic";

export const PATCH = handleRoute(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await requireStaff();

    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const { status } = updateEnquirySchema.parse(body);

    const enquiry = await setEnquiryStatus(id, status, session.userId);

    return jsonResponse({ enquiry });
  },
);

/** Permanent deletion, for erasure requests. See deleteEnquiry. */
export const DELETE = handleRoute(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    await requireStaff();

    const { id } = await context.params;
    await deleteEnquiry(id);

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store, private" },
    });
  },
);
