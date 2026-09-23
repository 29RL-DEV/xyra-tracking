import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  readMigrationSql,
  startLocalPostgres,
  type LocalDatabase,
} from "../../scripts/embedded-db";

/**
 * Starts a PostgreSQL server for the test run and applies the committed
 * migration, so service and API tests exercise the same database engine
 * production uses.
 *
 * Each run gets its own data directory. PostgreSQL derives its shared-memory
 * key from the data directory path, so a unique path means a run interrupted
 * half way through — leaving orphaned worker processes behind — cannot block
 * the next one with "pre-existing shared memory block is still in use".
 */
const TEST_PORT = 5434;
const ROOT = ".postgres-test";

let database: LocalDatabase | undefined;
let dataDir: string | undefined;

/** Best-effort removal of directories left by earlier runs. */
function clearStaleRuns(): void {
  if (!existsSync(ROOT)) return;

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      rmSync(path.join(ROOT, entry.name), { recursive: true, force: true });
    } catch {
      // A directory still held by an orphaned process stays put. The run does
      // not depend on removing it, because this run uses a fresh path.
    }
  }
}

export async function setup() {
  // CI supplies its own PostgreSQL service, so there is nothing to start —
  // only a schema to build.
  if (process.env.TEST_DATABASE_URL) {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });

    await client.connect();
    try {
      await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
      await client.query(readMigrationSql());
    } finally {
      await client.end();
    }
    return;
  }

  clearStaleRuns();

  dataDir = path.join(ROOT, `run-${process.pid}-${Date.now()}`);

  database = await startLocalPostgres({
    port: TEST_PORT,
    dataDir,
    persistent: false,
    quiet: true,
  });

  await database.execute(readMigrationSql());
}

export async function teardown() {
  await database?.stop();
}
