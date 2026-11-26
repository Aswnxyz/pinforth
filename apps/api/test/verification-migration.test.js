import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { expect, it } from "vitest";
import { assertTestDatabase } from "./database-url.js";

const migrations = new URL("../prisma/migrations/", import.meta.url);
const schemaMigration = "20261126073456_add_issue_verification";
const timestamp = new Date("2026-01-01");

async function applyMigrations(client, names) {
  for (const name of names) {
    const sql = await readFile(new URL(`${name}/migration.sql`, migrations), "utf8");
    await client.query(sql);
  }
}

it("upgrades populated pre-phase data while protecting genuine history and closure metadata", async () => {
  const testUrl = new URL(process.env.TEST_DATABASE_URL);
  assertTestDatabase(testUrl.href);
  const databaseName = `pinforth_verification_${randomUUID().replaceAll("-", "")}_test`;
  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = "/postgres";
  testUrl.pathname = `/${databaseName}`;
  const admin = new pg.Client({ connectionString: maintenanceUrl.href });
  const client = new pg.Client({ connectionString: testUrl.href });
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    try {
      await client.connect();
      const directories = (await readdir(migrations, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
      await applyMigrations(client, directories.filter((name) => name < schemaMigration));

      const orgId = randomUUID();
      const projectId = randomUUID();
      const environmentId = randomUUID();
      const deploymentId = randomUUID();
      const userId = randomUUID();
      const issues = Array.from({ length: 5 }, () => randomUUID());
      await client.query('INSERT INTO "User" (id, email, "updatedAt") VALUES ($1, $2, $3)', [userId, "tester@example.com", timestamp]);
      await client.query('INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ($1, $2, $2, $3)', [orgId, "agency", timestamp]);
      await client.query('INSERT INTO "Project" (id, "organizationId", name, slug, "updatedAt") VALUES ($1, $2, $3, $3, $4)', [projectId, orgId, "site", timestamp]);
      await client.query('INSERT INTO "Environment" (id, "projectId", name, slug, url, "updatedAt") VALUES ($1, $2, $3, $3, $4, $5)',
        [environmentId, projectId, "staging", "https://example.com", timestamp]);
      await client.query('INSERT INTO "Deployment" (id, "environmentId", label) VALUES ($1, $2, $3)', [deploymentId, environmentId, "v1"]);
      for (const [index, status] of ["READY_FOR_VERIFICATION", "CLOSED", "READY_FOR_VERIFICATION", "CLOSED", "IN_PROGRESS"].entries()) {
        await client.query('INSERT INTO "Issue" (id, "projectId", "environmentId", number, title, status, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [issues[index], projectId, environmentId, index + 1, "Checkout issue", status, timestamp]);
      }

      await applyMigrations(client, [schemaMigration]);
      // Simulate a database that already has valid data when the backfill runs.
      await client.query('UPDATE "Issue" SET "closeReason" = $2, "closedById" = $3, "closedAt" = $4 WHERE id = $1',
        [issues[3], "DUPLICATE", userId, timestamp]);
      await client.query('UPDATE "Issue" SET status = $2 WHERE id = $1', [issues[4], "VERIFIED"]);
      const [pendingFix, verifiedFix] = [randomUUID(), randomUUID()];
      for (const [id, issueId] of [[pendingFix, issues[2]], [verifiedFix, issues[4]]]) {
        await client.query('INSERT INTO "FixSubmission" (id, "issueId", "deploymentId", "submittedById", "clientMutationId", "attemptNumber") VALUES ($1, $2, $3, $4, $5, 1)',
          [id, issueId, deploymentId, userId, "fix"]);
      }
      const verificationId = randomUUID();
      await client.query('INSERT INTO "Verification" (id, "issueId", "fixSubmissionId", "deploymentId", "verifiedById", result, "clientMutationId") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [verificationId, issues[4], verifiedFix, deploymentId, userId, "PASS", "verify"]);

      await applyMigrations(client, directories.filter((name) => name > schemaMigration));
      const { rows } = await client.query('SELECT status, "closeReason", "closeNote", "closedAt", "closedById", "updatedAt" FROM "Issue" ORDER BY number');
      expect(rows).toMatchObject([
        { status: "IN_PROGRESS", closeReason: null },
        { status: "CLOSED", closeReason: "OTHER", closeNote: "Closed before close reasons were recorded. The original reason is unknown.", closedById: null, closedAt: null },
        { status: "READY_FOR_VERIFICATION" },
        { status: "CLOSED", closeReason: "DUPLICATE", closeNote: null, closedById: userId, closedAt: timestamp },
        { status: "VERIFIED" },
      ]);
      expect(rows.map(({ updatedAt }) => updatedAt)).toEqual(Array(5).fill(timestamp));
      expect((await client.query('SELECT id FROM "IssueActivity"')).rowCount).toBe(0);
      expect((await client.query('SELECT id FROM "FixSubmission"')).rows.map(({ id }) => id)).toEqual(expect.arrayContaining([pendingFix, verifiedFix]));
      expect((await client.query('SELECT id FROM "Verification"')).rows).toEqual([{ id: verificationId }]);
      expect((await client.query("SELECT proname FROM pg_proc WHERE proname = '_guard_issue_verification_backfill'")).rowCount).toBe(0);
    } finally {
      await client.end();
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }
}, 20_000);
