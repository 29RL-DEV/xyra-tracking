import type { NextRequest } from "next/server";
import { errors } from "./errors";

/** Malformed JSON is a client error, not a crash. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw errors.validation("The request body could not be read as JSON.");
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
