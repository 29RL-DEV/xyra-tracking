import { NextRequest } from "next/server";

const BASE = "http://localhost:3000";

export function get(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE), { method: "GET" });
}

export function send(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  /** Extra headers — rate-limit tests use these to act as different clients. */
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Route context for a dynamic segment, matching Next 15's async params. */
export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

export interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
