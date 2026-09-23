import { PrismaClient } from "@prisma/client";

/**
 * A single Prisma client per process. Next.js dev mode re-evaluates modules on
 * every change, so the client is cached on globalThis to avoid exhausting the
 * database connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
