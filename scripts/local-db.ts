/**
 * Starts a local PostgreSQL server for development and keeps it running.
 *
 *   npm run db:local
 *
 * Then, in another terminal:
 *   npm run db:migrate
 *   npm run db:seed
 *   npm run dev
 *
 * Production uses hosted PostgreSQL (Supabase); this exists so the project runs on
 * a machine without Docker or a system PostgreSQL installation.
 */
import { startLocalPostgres } from "./embedded-db";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const DATA_DIR = process.env.LOCAL_DB_DIR ?? ".postgres";

async function main() {
  const db = await startLocalPostgres({
    port: PORT,
    dataDir: DATA_DIR,
    persistent: true,
  });

  console.log(`Local PostgreSQL ready on 127.0.0.1:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`DATABASE_URL="${db.connectionString}"`);
  console.log("Press Ctrl+C to stop.");

  // The server runs detached from this process, so keep this process alive
  // until Ctrl+C, then shut the server down cleanly.
  const keepAlive = setInterval(() => {}, 1 << 30);

  const shutdown = async () => {
    console.log("\nStopping local PostgreSQL...");
    clearInterval(keepAlive);
    await db.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start the local database:", error);
  process.exit(1);
});
