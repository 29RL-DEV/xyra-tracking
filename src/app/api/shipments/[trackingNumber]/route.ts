import type { NextRequest } from "next/server";
import { errors } from "@/lib/api/errors";
import {
  checkRateLimit,
  TRACKING_LOOKUP_RATE_LIMIT,
  trackingLookupKey,
} from "@/lib/api/rate-limit";
import { clientIdentifier } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { isValidTrackingNumber } from "@/lib/domain/tracking-number";
import { getPublicShipment } from "@/lib/services/shipment-service";

// Never cached: a status change made by staff must be visible to the customer
// on the very next request.
export const dynamic = "force-dynamic";

/**
 * Public tracking lookup.
 *
 * Returns only the public projection. Internal notes are not fetched by the
 * service at all, so they cannot appear here at any nesting depth.
 *
 * Rate limited per client, sharing its budget with the /track page, which
 * reads the same data on the server.
 */
export const GET = handleRoute(
  async (
    request: NextRequest,
    context: { params: Promise<{ trackingNumber: string }> },
  ) => {
    const { allowed } = checkRateLimit(
      trackingLookupKey(clientIdentifier(request)),
      TRACKING_LOOKUP_RATE_LIMIT,
    );

    if (!allowed) {
      throw errors.lookupRateLimited();
    }

    const { trackingNumber } = await context.params;
    const decoded = decodeURIComponent(trackingNumber);

    if (!isValidTrackingNumber(decoded)) {
      throw errors.validation("That does not look like a tracking number.", {
        trackingNumber:
          "Use 6 to 40 characters: letters, digits and hyphens only.",
      });
    }

    const result = await getPublicShipment(decoded);
    return jsonResponse(result);
  },
);
