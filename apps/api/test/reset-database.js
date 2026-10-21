import { prisma } from "../src/lib/prisma.js";
import { assertTestDatabase } from "./database-url.js";

// Empties every application table between tests. Leaves migration history intact.
export async function resetDatabase() {
  assertTestDatabase(process.env.DATABASE_URL ?? "");

  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
