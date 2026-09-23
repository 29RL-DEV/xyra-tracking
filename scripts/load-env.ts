/**
 * Loads .env for standalone Node scripts (seed, test setup).
 *
 * The Next.js runtime and the Prisma CLI load .env themselves; a plain `tsx`
 * process does not. On a deployed host the variables come from the platform
 * and no .env file exists, so a missing file is not an error here — the code
 * that actually needs a value reports it by name.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export function loadEnv(file = ".env"): void {
  const resolved = path.resolve(file);

  if (!existsSync(resolved)) return;

  // Available since Node 20.12. Values already present in the environment win,
  // which is what a deployed host expects.
  process.loadEnvFile(resolved);
}
