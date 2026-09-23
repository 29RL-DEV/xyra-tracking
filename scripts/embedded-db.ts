/**
 * Local PostgreSQL for development and tests.
 *
 * Production runs on hosted PostgreSQL (Supabase). This module runs a real
 * PostgreSQL server from the binaries bundled with the `embedded-postgres`
 * package, so the application can be developed and tested on a machine with no
 * Docker and no system-wide PostgreSQL installation. The schema, migrations and
 * queries are identical to the ones production uses — only the host differs.
 *
 * Only the bundled binaries are used — `initdb` and `pg_ctl` are driven
 * directly, and the package's own entry point is never imported. That entry
 * point installs a process exit hook that calls `process.exit()` itself, which
 * discards the exit code of whatever imported it: a failing test run would exit
 * 0 and report success to CI. It also stops the server on Windows with a forced
 * `taskkill`, which skips PostgreSQL's orderly shutdown and leaves worker
 * processes holding the port. `pg_ctl` avoids both problems.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "postgres";

export interface LocalDatabaseOptions {
  port: number;
  dataDir: string;
  /** false deletes the data directory on stop, which is what tests want. */
  persistent: boolean;
  /** Suppresses progress output, which tests do not need. */
  quiet?: boolean;
}

export interface LocalDatabase {
  connectionString: string;
  /** Runs SQL against the running server, used to apply migrations. */
  execute: (sql: string) => Promise<void>;
  stop: () => Promise<void>;
}

interface Binaries {
  initdb: string;
  pg_ctl: string;
}

export function connectionStringFor(port: number): string {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;
}

/** The platform package that ships the PostgreSQL binaries for this machine. */
function platformPackage(): string {
  const key = `${os.platform()}-${os.arch()}`;
  const supported: Record<string, string> = {
    "win32-x64": "@embedded-postgres/windows-x64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "linux-arm64": "@embedded-postgres/linux-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
  };

  const name = supported[key];
  if (!name) {
    throw new Error(
      `No bundled PostgreSQL for ${key}. Set TEST_DATABASE_URL / DATABASE_URL to an existing server instead.`,
    );
  }
  return name;
}

/** Paths only — the platform package exports nothing else and runs no code. */
async function binaries(): Promise<Binaries> {
  const loaded = (await import(platformPackage())) as Partial<Binaries> & {
    default?: Partial<Binaries>;
  };
  const source = loaded.default ?? loaded;

  if (!source.initdb || !source.pg_ctl) {
    throw new Error("Could not locate initdb and pg_ctl in the bundled PostgreSQL package.");
  }
  return { initdb: source.initdb, pg_ctl: source.pg_ctl };
}

/**
 * Runs a PostgreSQL tool and resolves with its exit code and any error output.
 *
 * stdout is ignored and stdin closed. For `pg_ctl start` this matters: the
 * server it launches would otherwise inherit the pipes and hold them open for
 * its whole lifetime, and a caller waiting for them to close would wait forever.
 * Completion is taken from "exit" rather than "close" for the same reason.
 */
function runTool(
  binary: string,
  args: string[],
  captureErrors = false,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "ignore", captureErrors ? "pipe" : "ignore"],
      windowsHide: true,
      env: { ...process.env, LC_MESSAGES: "C" },
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/** Creates a new cluster with password authentication and UTF-8 encoding. */
async function initialiseCluster(initdb: string, dataDir: string): Promise<void> {
  mkdirSync(path.dirname(dataDir), { recursive: true });

  const passwordFile = path.join(
    os.tmpdir(),
    `pg-password-${randomBytes(6).toString("hex")}`,
  );
  writeFileSync(passwordFile, `${PASSWORD}\n`, { mode: 0o600 });

  try {
    const { code, stderr } = await runTool(
      initdb,
      [
        `--pgdata=${dataDir}`,
        `--username=${USER}`,
        `--pwfile=${passwordFile}`,
        "--auth=scram-sha-256",
        // Match hosted PostgreSQL. Without this, initdb inherits the host
        // locale, which on Windows means WIN1252 and rejects ordinary
        // punctuation a customer might type.
        "--encoding=UTF8",
        "--locale=C",
      ],
      true,
    );

    if (code !== 0) {
      throw new Error(`initdb failed (exit ${code}): ${stderr.trim()}`);
    }
  } finally {
    try {
      unlinkSync(passwordFile);
    } catch {
      // Already gone.
    }
  }
}

/**
 * Whether a usable PostgreSQL server is already answering on the port.
 *
 * A real connection rather than a bare TCP probe: a server that died uncleanly
 * can leave a socket that accepts connections and then never replies.
 */
async function serverIsUsable(port: number): Promise<boolean> {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: connectionStringFor(port),
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function startLocalPostgres(
  options: LocalDatabaseOptions,
): Promise<LocalDatabase> {
  const dataDir = path.resolve(options.dataDir);
  const logFile = path.join(dataDir, "server.log");

  if (!options.persistent && existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }

  const { initdb, pg_ctl: pgCtl } = await binaries();

  const alreadyInitialised = existsSync(path.join(dataDir, "PG_VERSION"));
  const reuseExisting = alreadyInitialised && (await serverIsUsable(options.port));

  if (!alreadyInitialised) {
    await initialiseCluster(initdb, dataDir);
  }

  if (!reuseExisting) {
    const { code } = await runTool(pgCtl, [
      "start",
      "-D", dataDir,
      "-l", logFile,
      "-o", `-p ${options.port}`,
      "-w",
      "-t", "60",
    ]);

    if (code !== 0) {
      throw new Error(
        `PostgreSQL did not start on port ${options.port} (pg_ctl exit ${code}). ` +
          `Is something else using that port? Details are in ${logFile}.`,
      );
    }
  }

  if (!options.quiet) {
    console.log(`PostgreSQL ${reuseExisting ? "reused" : "started"} on port ${options.port}`);
  }

  return {
    connectionString: connectionStringFor(options.port),

    execute: async (sql: string) => {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: connectionStringFor(options.port) });

      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    },

    stop: async () => {
      // Only stop what this process started. A reused server belongs to
      // whoever launched it.
      if (!reuseExisting) {
        const { code } = await runTool(pgCtl, [
          "stop", "-D", dataDir, "-m", "fast", "-w", "-t", "60",
        ]).catch(() => ({ code: 1, stderr: "" }));

        if (code !== 0) {
          console.error(`PostgreSQL did not stop cleanly (pg_ctl exit ${code}). See ${logFile}.`);
        }
      }

      if (!options.persistent) {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}

/** The committed migration SQL, concatenated in order. */
export function readMigrationSql(
  migrationsDir = path.resolve("prisma/migrations"),
): string {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => path.join(migrationsDir, name, "migration.sql"))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}
