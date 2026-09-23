import type { FieldErrors } from "@/lib/api/errors";

/**
 * Browser-side API client.
 *
 * Every failure arrives in the same envelope, so callers get a typed error with
 * a code, a message safe to display, and per-field messages that map onto the
 * same inputs client validation uses.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: FieldErrors | undefined;

  constructor(
    code: string,
    status: number,
    message: string,
    fields?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/**
 * A session that runs out mid-task should return the person to the sign-in
 * screen with an explanation, not strand them on a staff page showing an error
 * panel they cannot act on.
 *
 * Only staff pages redirect: a 401 cannot occur on the public side, and a
 * public page must never bounce a customer to a login screen.
 */
function handleLostSession(code: string): void {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/staff")) return;
  if (window.location.pathname.startsWith("/staff/login")) return;

  const reason = code === "SESSION_EXPIRED" ? "expired" : "signed-out";
  window.location.assign(`/staff/login?reason=${reason}`);
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const envelope = body as
      | { error?: { code?: string; message?: string; fields?: FieldErrors } }
      | null;

    const code = envelope?.error?.code ?? "INTERNAL_ERROR";

    if (response.status === 401) {
      handleLostSession(code);
    }

    throw new ApiError(
      code,
      response.status,
      envelope?.error?.message ?? "Something went wrong. Please try again.",
      envelope?.error?.fields,
    );
  }

  return body as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
    // Always ask the server: a status change must be visible immediately.
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });

  return parse<T>(response);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  return parse<T>(response);
}
