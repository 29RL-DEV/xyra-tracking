import type { NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import { parseJsonBody, searchParamsToObject } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  createShipment,
  createShipmentIdempotently,
  listShipments,
} from "@/lib/services/shipment-service";
import {
  createShipmentSchema,
  shipmentQuerySchema,
} from "@/lib/validation/shipment";

export const dynamic = "force-dynamic";

/**
 * A plain token, so it can be stored and compared exactly as sent: long enough
 * that a client generating its own will not repeat one by accident, and short
 * enough to index.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The optional Idempotency-Key header, or null when none was sent. A key that
 * is present but malformed is refused rather than ignored: the caller is
 * relying on it to make a retry safe, and ignoring it would quietly take that
 * protection away.
 */
function readIdempotencyKey(request: NextRequest): string | null {
  const key = request.headers.get("idempotency-key");

  if (key === null) return null;

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw errors.validation(
      "The Idempotency-Key header must be 8 to 128 characters long and use only letters, digits, hyphens and underscores.",
    );
  }

  return key;
}

export const GET = handleRoute(async (request: NextRequest) => {
  await requireStaff();

  const query = shipmentQuerySchema.parse(searchParamsToObject(request));
  const result = await listShipments(query);

  return jsonResponse(result);
});

export const POST = handleRoute(async (request: NextRequest) => {
  const session = await requireStaff();

  const idempotencyKey = readIdempotencyKey(request);
  const body = await parseJsonBody(request);

  // Explicit rejection, so the caller gets an explanation rather than an
  // "unrecognised key" error from the schema.
  if (body && typeof body === "object" && "trackingNumber" in body) {
    throw errors.validation(
      "Tracking numbers are generated when a shipment is created, so that one cannot be guessed from another.",
      { trackingNumber: "Leave this out: a tracking number is generated for the shipment." },
    );
  }

  const input = createShipmentSchema.parse(body);

  if (idempotencyKey === null) {
    const shipment = await createShipment(input, session.userId);
    return jsonResponse({ shipment }, 201);
  }

  const { shipment, replayed } = await createShipmentIdempotently(
    input,
    session.userId,
    idempotencyKey,
  );
  const response = jsonResponse({ shipment }, 201);

  // A repeat is answered with the same status and the same shipment as the
  // original, and says that it is one, so a client can tell its retry created
  // nothing new.
  if (replayed) {
    response.headers.set("Idempotent-Replayed", "true");
  }

  return response;
});
