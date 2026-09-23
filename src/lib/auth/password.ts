import bcrypt from "bcryptjs";

/**
 * bcryptjs is used rather than native bcrypt so the application builds and runs
 * on a serverless host without a native compilation step.
 */
const COST = 10;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
