import type { NextRequest } from "next/server";
import { parseJsonBody, searchParamsToObject } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import { createShipment, listShipments } from "@/lib/services/shipment-service";
import {
  createShipmentSchema,
  shipmentQuerySchema,
} from "@/lib/validation/shipment";

export const dynamic = "force-dynamic";

export const GET = handleRoute(async (request: NextRequest) => {
  await requireStaff();

  const query = shipmentQuerySchema.parse(searchParamsToObject(request));
  const result = await listShipments(query);

  return jsonResponse(result);
});

export const POST = handleRoute(async (request: NextRequest) => {
  const session = await requireStaff();

  const body = await parseJsonBody(request);
  const input = createShipmentSchema.parse(body);
  const shipment = await createShipment(input, session.userId);

  return jsonResponse({ shipment }, 201);
});
