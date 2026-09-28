import type { NextRequest } from "next/server";
import { errors } from "./errors";

/**
 * Reads a JSON request body. Malformed JSON is a client error, not a crash.
 *
 * The body must be declared as JSON. An HTML form on another site can only
 * send form encodings or text/plain, and a script there cannot send
 * application/json to this origin without a CORS preflight, which is refused.
 * So no other site can post to these endpoints, including sign-in, which has no
 * session cookie to protect it.
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw errors.unsupportedMediaType();
  }

  try {
    return await request.json();
  } catch {
    throw errors.validation("The request body could not be read as JSON.");
  }
}

/**
 * Whether a browser marked this request as sent by another site. Browsers send
 * Sec-Fetch-Site, and Origin on a POST; a request with neither did not come
 * from a page on another site, so it is not treated as cross-site.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite !== "same-origin" && fetchSite !== "none";
  }

  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

/**
 * A dynamic path segment decoded once more, or null when it cannot be. Next.js
 * has already decoded it, so this only matters for a segment that still holds
 * a "%": a malformed escape there is bad input, not a server error.
 */
export function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function searchParamsToObject(request: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};

  request.nextUrl.searchParams.forEach((value, key) => {
    // Empty means "not set": `?status=` then applies no filter instead of
    // failing validation as an unsupported status.
    if (value !== "") {
      result[key] = value;
    }
  });

  return result;
}

/**
 * Best-effort client identity for rate limiting. Behind a proxy the forwarded
 * header is what is available; it is spoofable, which is why the limiter is
 * documented as mitigation rather than protection.
 */
export function clientIdentifier(request: NextRequest): string {
  return clientIdentifierFromHeaders(request.headers);
}

/** The same identity from bare headers, for server components with no request object. */
export function clientIdentifierFromHeaders(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return headers.get("x-real-ip") ?? "unknown";
}
