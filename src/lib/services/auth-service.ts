import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_MAX_AGE_SECONDS, type SessionPayload } from "@/lib/auth/session";
import type { LoginInput } from "@/lib/validation/auth";

/** Distinct class so the route maps it to a 401 without leaking the reason. */
export class AuthenticationError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "AuthenticationError";
  }
}

/**
 * A real hash to compare against when no user matches, so an unknown email and
 * a wrong password take comparable time. Computed once, lazily.
 */
let decoyHash: Promise<string> | null = null;

function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword("no-such-account-placeholder");
  return decoyHash;
}

/**
 * Authenticates a staff member.
 *
 * An unknown email and a wrong password produce the identical error, because
 * distinguishing them would confirm which addresses have accounts.
 */
export async function authenticate(input: LoginInput): Promise<SessionPayload> {
  const user = await prisma.staffUser.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user) {
    await verifyPassword(input.password, await getDecoyHash());
    throw new AuthenticationError();
  }

  const valid = await verifyPassword(input.password, user.passwordHash);

  if (!valid) {
    throw new AuthenticationError();
  }

  return { userId: user.id, email: user.email, name: user.name };
}

/**
 * Records a new sign-in for the account and returns its id, which the session
 * token then carries. The row expires when the token does.
 *
 * The id comes from a cryptographically secure source, so one session's id
 * says nothing about another's. The account's expired and signed-out rows are
 * removed here too: they can never be used again, and clearing them at each
 * sign-in keeps the table bounded without a scheduled job.
 */
export async function startSession(staffUserId: string): Promise<string> {
  const now = new Date();

  await prisma.staffSession.deleteMany({
    where: {
      staffUserId,
      OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
    },
  });

  const session = await prisma.staffSession.create({
    data: {
      id: crypto.randomUUID(),
      staffUserId,
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
    },
    select: { id: true },
  });

  return session.id;
}

/**
 * Ends one session on the server, so a copy of its token stops working even
 * though its signature is still valid. Only this session: other people signed
 * in to the same account stay signed in.
 *
 * Idempotent. A session already ended, or whose row is gone, is left as it is,
 * so signing out twice is not an error and keeps the first sign-out time.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.staffSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
