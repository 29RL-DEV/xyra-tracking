import type { NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import { clientIdentifier, parseJsonBody } from "@/lib/api/request";
import { checkRateLimit, ENQUIRY_RATE_LIMIT } from "@/lib/api/rate-limit";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { createEnquirySchema } from "@/lib/validation/enquiry";

export const dynamic = "force-dynamic";

/**
 * Customer enquiry submission — the only unauthenticated write in the system.
 *
 * The response is a receipt and nothing more. It never echoes shipment data,
 * which would turn this endpoint into a second, differently shaped tracking
 * lookup.
 */
export const POST = handleRoute(async (request: NextRequest) => {
  const { allowed } = checkRateLimit(
    `enquiry:${clientIdentifier(request)}`,
    ENQUIRY_RATE_LIMIT,
  );

  if (!allowed) {
    throw errors.rateLimited();
  }

  const body = await parseJsonBody(request);
  const input = createEnquirySchema.parse(body);

  const { enquiry, duplicate } = await createEnquiry(input);

  return jsonResponse({ enquiry }, duplicate ? 200 : 201);
});
