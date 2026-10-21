
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const apiDir = dirname(fileURLToPath(import.meta.url));

// Load the existing .env from the monorepo root.
config({ path: resolve(apiDir, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: env("DATABASE_URL"),
  },
});

