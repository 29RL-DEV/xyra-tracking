import type { NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import { clientIdentifier, parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { createEnquiry } from "@/lib/services/enquiry-service";
import {
  countSharedHit,
  ENQUIRY_CLIENT_LIMIT,
  ENQUIRY_GLOBAL_KEY,
  ENQUIRY_GLOBAL_LIMIT,
  ENQUIRY_TRACKING_NUMBER_LIMIT,
  enquiryClientKey,
  enquiryTrackingNumberKey,
  type SharedRateLimitOptions,
} from "@/lib/services/shared-rate-limit";
import { createEnquirySchema } from "@/lib/validation/enquiry";

export const dynamic = "force-dynamic";

async function enforceLimit(key: string, options: SharedRateLimitOptions): Promise<void> {
  if (!(await countSharedHit(key, options))) {
    throw errors.rateLimited();
  }
}

/**
 * Customer enquiry submission — the only unauthenticated write in the system.
 *
 * The response is a receipt and nothing more. It never echoes shipment data,
 * which would turn this endpoint into a second, differently shaped tracking
 * lookup.
 *
 * The limits are shared by every instance and explained in shared-rate-limit.
 * They are checked narrowest first and the first one exceeded ends the
 * request, so a single client hammering the form is turned away before it can
 * use up the allowance of a tracking number or of everyone.
 */
export const POST = handleRoute(async (request: NextRequest) => {
  // Before the body is read, so malformed submissions count as well.
  await enforceLimit(enquiryClientKey(clientIdentifier(request)), ENQUIRY_CLIENT_LIMIT);

  const body = await parseJsonBody(request);
  const input = createEnquirySchema.parse(body);

  // Before the shipment is looked up, so an unknown number is counted and
  // turned away exactly as a real one is.
  await enforceLimit(
    enquiryTrackingNumberKey(input.trackingNumber),
    ENQUIRY_TRACKING_NUMBER_LIMIT,
  );
  await enforceLimit(ENQUIRY_GLOBAL_KEY, ENQUIRY_GLOBAL_LIMIT);

  const { enquiry, duplicate } = await createEnquiry(input);

  return jsonResponse({ enquiry }, duplicate ? 200 : 201);
});
