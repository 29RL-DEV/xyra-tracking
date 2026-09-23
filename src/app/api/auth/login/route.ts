import type { NextRequest } from "next/server";
import { AppError, errors } from "@/lib/api/errors";
import {
  clearRateLimit,
  isRateLimited,
  LOGIN_CLIENT_RATE_LIMIT,
  LOGIN_IDENTITY_RATE_LIMIT,
  recordFailure,
} from "@/lib/api/rate-limit";
import { clientIdentifier, parseJsonBody } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { authenticate, AuthenticationError } from "@/lib/services/auth-service";
import { loginSchema } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

/**
 * Sign-in.
 *
 * Failed attempts are throttled per client address, and more tightly per
 * client address and account. Only failures count, and a success clears both
 * counters, so an operator who mistypes their password a few times is never
 * locked out of their own console.
 *
 * The limiter is in-memory, so on a serverless host the counters are per
 * running instance rather than global: the effective limit across several warm
 * instances is a multiple of the configured one. That raises the cost of a
 * guessing attack substantially without being the distributed control a shared
 * store would provide. The limitation is recorded in the README rather than
 * overstated here.
 */
export const POST = handleRoute(async (request: NextRequest) => {
  const body = await parseJsonBody(request);
  const input = loginSchema.parse(body);

  const client = clientIdentifier(request);
  const clientKey = `login:client:${client}`;
  // The schema has already lowercased and trimmed the address.
  const identityKey = `login:identity:${client}|${input.email}`;

  if (
    isRateLimited(clientKey, LOGIN_CLIENT_RATE_LIMIT) ||
    isRateLimited(identityKey, LOGIN_IDENTITY_RATE_LIMIT)
  ) {
    // Thrown before any password comparison, so a blocked client cannot keep
    // spending bcrypt work on the server either.
    throw errors.tooManyAttempts();
  }

  let session;

  try {
    session = await authenticate(input);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      recordFailure(clientKey, LOGIN_CLIENT_RATE_LIMIT);
      recordFailure(identityKey, LOGIN_IDENTITY_RATE_LIMIT);

      // One message for both an unknown email and a wrong password.
      throw new AppError("UNAUTHENTICATED", 401, "Email or password is incorrect.");
    }
    throw error;
  }

  clearRateLimit(clientKey);
  clearRateLimit(identityKey);

  const token = await signSession(session);
  await setSessionCookie(token);

  // The password hash is never selected into this response shape.
  return jsonResponse({
    user: { id: session.userId, name: session.name, email: session.email },
  });
});
