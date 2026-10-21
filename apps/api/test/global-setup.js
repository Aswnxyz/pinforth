import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertTestDatabase } from "./database-url.js";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Creates the test database if needed and applies all migrations to it.
export default async function setup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not set (see vitest.config.ts)");
  }

  const name = assertTestDatabase(testDatabaseUrl);

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();

  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);

    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "pipe",
  });
}
