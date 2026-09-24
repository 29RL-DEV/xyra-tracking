import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/public/site-header";
import { TrackingExperience } from "@/components/public/tracking-experience";
import { AppError, errors } from "@/lib/api/errors";
import {
  checkRateLimit,
  TRACKING_LOOKUP_RATE_LIMIT,
  trackingLookupKey,
} from "@/lib/api/rate-limit";
import { clientIdentifierFromHeaders } from "@/lib/api/request";
import { isValidTrackingNumber, normaliseTrackingNumber } from "@/lib/domain/tracking-number";
import type { PublicTrackingResult } from "@/lib/dto/shipment";
import { getPublicShipment } from "@/lib/services/shipment-service";

// A shipment's state changes as staff work on it, so this page is always fresh.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ trackingNumber: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { trackingNumber } = await params;
  return {
    title: `Tracking ${normaliseTrackingNumber(decodeURIComponent(trackingNumber))}`,
    // One person's shipment is not something a search engine should list,
    // and the tracking number is in both the URL and the title.
    robots: { index: false, follow: false },
  };
}

/**
 * Deep link for a single shipment: shareable, refreshable and directly
 * loadable. The lookup runs on the server so the result is present in the first
 * response rather than after a client round trip.
 *
 * It reads the same data as the public API, so it draws on the same per-client
 * lookup budget — otherwise the page would be a way round the API's limit.
 *
 * An unknown or malformed number answers with HTTP 404, like the API does. The
 * app's not-found page recognises a tracking URL and shows this page's own
 * "not found" state, so the customer can correct the number in place.
 */
export default async function TrackPage({ params }: PageProps) {
  const raw = normaliseTrackingNumber(decodeURIComponent((await params).trackingNumber));

  let result: PublicTrackingResult | undefined;
  let missing = false;
  let lookupError: string | undefined;

  const { allowed } = checkRateLimit(
    trackingLookupKey(clientIdentifierFromHeaders(await headers())),
    TRACKING_LOOKUP_RATE_LIMIT,
  );

  if (!allowed) {
    lookupError = errors.lookupRateLimited().message;
  } else if (isValidTrackingNumber(raw)) {
    try {
      result = await getPublicShipment(raw);
    } catch (error) {
      if (error instanceof AppError && error.code === "SHIPMENT_NOT_FOUND") {
        missing = true;
      } else {
        throw error;
      }
    }
  } else {
    missing = true;
  }

  if (missing) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <TrackingExperience
          initialTrackingNumber={raw}
          {...(result ? { initialResult: result } : {})}
          {...(lookupError ? { initialError: lookupError } : {})}
        />
      </main>

      <SiteFooter />
    </div>
  );
}
