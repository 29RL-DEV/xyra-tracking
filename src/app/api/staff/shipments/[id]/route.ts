import type { NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  getStaffShipmentDetail,
  updateShipment,
} from "@/lib/services/shipment-service";
import { updateShipmentSchema } from "@/lib/validation/shipment";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (_request: NextRequest, context: Context) => {
  await requireStaff();

  const { id } = await context.params;
  const detail = await getStaffShipmentDetail(id);

  return jsonResponse(detail);
});

export const PATCH = handleRoute(async (request: NextRequest, context: Context) => {
  const session = await requireStaff();

  const { id } = await context.params;
  const body = await parseJsonBody(request);

  // Explicit rejection, so the caller gets an explanation rather than an
  // "unrecognised key" error from the schema.
  if (body && typeof body === "object" && "trackingNumber" in body) {
    throw errors.immutableField(
      "trackingNumber",
      "A tracking number cannot be changed after a shipment is created. Customers may already be using it.",
    );
  }

  const input = updateShipmentSchema.parse(body);
  const shipment = await updateShipment(id, input, session.userId);

  return jsonResponse({ shipment });
});
