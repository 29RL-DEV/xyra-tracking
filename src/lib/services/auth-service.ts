import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { SessionPayload } from "@/lib/auth/session";
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
