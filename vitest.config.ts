import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    // Starts a real PostgreSQL server for the suite and applies the committed
    // migration, so service and API tests run against the same database engine
    // production uses.
    globalSetup: ["./tests/setup/global-db.ts"],
    setupFiles: ["./tests/setup/test-env.ts"],
    env: {
      // TEST_DATABASE_URL lets CI point the suite at a PostgreSQL service
      // container. Without it, the suite starts its own server locally.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5434/postgres",
      SESSION_SECRET: "test-session-secret-that-is-at-least-32-chars",
    },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // One worker: the tests share a single database and reset it between cases.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
