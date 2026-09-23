import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logError } from "@/lib/log";
import { AppError, errors, type FieldErrors } from "./errors";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldErrors;
  };
}

/** Flattens a Zod issue list into one message per field path. */
export function zodToFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!(path in fields)) {
      fields[path] = issue.message;
    }
  }

  return fields;
}

/** The errors the application expects, as responses. Null for anything else. */
function toKnownError(error: unknown): AppError | null {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return errors.validation(
      "Some of the details need attention.",
      zodToFieldErrors(error),
    );
  }

  return null;
}

/**
 * API responses are never cached.
 *
 * A staff change has to be visible to the customer on their next request, and
 * an authenticated response must never be stored by a shared cache. Without an
 * explicit header an intermediary is free to apply heuristic freshness, so it
 * is set on every response rather than left to the platform.
 */
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

/**
 * Anything unrecognised is logged here and reported generically. This is the
 * only place an unexpected error is allowed to reach, and it never forwards
 * the original message to the client. The generated id goes both into the log
 * line and into an `X-Error-Id` response header, so a reported failure can be
 * matched to its log entry.
 */
export function errorResponse(error: unknown, request?: Request): NextResponse<ApiErrorBody> {
  let appError = toKnownError(error);
  const headers: Record<string, string> = { ...NO_STORE };

  if (!appError) {
    const errorId = crypto.randomUUID();
    logError("api.unhandled_error", error, {
      errorId,
      ...(request ? { method: request.method, path: new URL(request.url).pathname } : {}),
    });
    headers["X-Error-Id"] = errorId;
    appError = errors.internal();
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fields ? { fields: appError.fields } : {}),
    },
  };

  return NextResponse.json(body, { status: appError.status, headers });
}

export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/**
 * Wraps a route handler so that every thrown error becomes a safe response.
 * Handlers can therefore throw domain errors instead of threading status codes
 * through their return types.
 */
export function handleRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] instanceof Request ? args[0] : undefined;
      return errorResponse(error, request);
    }
  };
}
