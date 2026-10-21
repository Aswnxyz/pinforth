import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { toTestDatabaseUrl } from "./test/database-url.js";

const apiDir = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(apiDir, "../../.env"), quiet: true });

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? toTestDatabaseUrl(process.env.DATABASE_URL);

// globalSetup runs in this process and doesn't receive `test.env`.
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      WEB_ORIGIN: "http://localhost:3000",
    },
    // Test files share one database.
    fileParallelism: false,
  },
});
