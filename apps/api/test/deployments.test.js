import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

async function userWithSession(email, { verified = true } = {}) {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .set("Origin", WEB_ORIGIN)
    .send(credentials({ email, name: email.split("@")[0] }));
  await waitForPendingMail();

  const userId = res.body.data.user.id;
  if (verified) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  const access = cookieValue(res, "pf_access");
  const as = (method, path) =>
    request(app)[method](`/api/v1${path}`).set("Origin", WEB_ORIGIN).set("Cookie", `pf_access=${access}`);

  return { userId, email, as };
}

async function setupTeam() {
  const owner = await userWithSession("owner@example.com");
  const admin = await userWithSession("admin@example.com");
  const member = await userWithSession("member@example.com");
  const unverified = await userWithSession("unverified@example.com", { verified: false });
  const outsider = await userWithSession("outsider@example.com");

  const orgRes = await owner.as("post", "/organizations").send({ name: "Acme Agency" });
  const orgId = orgRes.body.data.organization.id;

  const otherOrgRes = await outsider.as("post", "/organizations").send({ name: "Rival Agency" });
  const otherOrgId = otherOrgRes.body.data.organization.id;

  await Promise.all([
    prisma.organizationMember.create({
      data: { organizationId: orgId, userId: admin.userId, role: "ADMIN" },
    }),
    prisma.organizationMember.create({
      data: { organizationId: orgId, userId: member.userId, role: "MEMBER" },
    }),
    prisma.organizationMember.create({
      data: { organizationId: orgId, userId: unverified.userId, role: "MEMBER" },
    }),
  ]);

  const projectsPath = `/organizations/${orgId}/projects`;
  const project = (
    await owner.as("post", projectsPath).send({ name: "Acme Website" })
  ).body.data.project;
  const portal = (
    await owner.as("post", projectsPath).send({ name: "Acme Portal" })
  ).body.data.project;

  const environment = (
    await owner
      .as("post", `${projectsPath}/${project.slug}/environments`)
      .send({ name: "Staging", url: "https://staging.acme.com" })
  ).body.data.environment;
  const preview = (
    await owner
      .as("post", `${projectsPath}/${project.slug}/environments`)
      .send({ name: "Preview", url: "https://preview.acme.com" })
  ).body.data.environment;
  const portalEnvironment = (
    await owner
      .as("post", `${projectsPath}/${portal.slug}/environments`)
      .send({ name: "Staging", url: "https://portal.acme.com" })
  ).body.data.environment;

  const rivalProject = (
    await outsider
      .as("post", `/organizations/${otherOrgId}/projects`)
      .send({ name: "Rival Site" })
  ).body.data.project;
  const rivalEnvironment = (
    await outsider
      .as("post", `/organizations/${otherOrgId}/projects/${rivalProject.slug}/environments`)
      .send({ name: "Staging", url: "https://rival.example" })
  ).body.data.environment;

  const projectPath = `${projectsPath}/${project.slug}`;
  const deploymentsPath = `${projectPath}/environments/${environment.id}/deployments`;

  return {
    owner,
    admin,
    member,
    unverified,
    outsider,
    orgId,
    otherOrgId,
    projectsPath,
    projectPath,
    project,
    portal,
    environment,
    preview,
    portalEnvironment,
    rivalEnvironment,
    deploymentsPath,
    previewDeploymentsPath: `${projectPath}/environments/${preview.id}/deployments`,
    portalDeploymentsPath: `${projectsPath}/${portal.slug}/environments/${portalEnvironment.id}/deployments`,
    rivalDeploymentsPath: `/organizations/${otherOrgId}/projects/${rivalProject.slug}/environments/${rivalEnvironment.id}/deployments`,
  };
}

const createDeployment = (as, path, body) => as("post", path).send(body);

const seedDeployment = (environmentId, label, createdAt, createdById = null) =>
  prisma.deployment.create({
    data: { environmentId, label, createdAt, createdById },
  });

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST deployments", () => {
  it("records a deployment with only the required label", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.member.as, t.deploymentsPath, { label: "v1.0" });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data.deployment).sort()).toEqual(
      ["commitSha", "createdAt", "createdBy", "environmentId", "id", "label", "notes", "url"].sort()
    );
    expect(res.body.data.deployment).toMatchObject({
      environmentId: t.environment.id,
      label: "v1.0",
      commitSha: null,
      url: null,
      notes: null,
      createdBy: { id: t.member.userId, name: "member" },
    });
    expect(res.body.data.deployment.id).toBeDefined();
    expect(res.body.data.deployment.createdAt).toBeDefined();
  });

  it("records every optional field", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.5",
      commitSha: "a1b2c3d",
      url: "https://staging.example.com",
      notes: "Checkout and responsive navigation fixes.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment).toMatchObject({
      label: "v1.5",
      commitSha: "a1b2c3d",
      url: "https://staging.example.com",
      notes: "Checkout and responsive navigation fixes.",
    });
  });

  it("allows OWNER, ADMIN and MEMBER to record a deployment", async () => {
    const t = await setupTeam();

    for (const [user, label] of [
      [t.owner, "owner-1"],
      [t.admin, "admin-1"],
      [t.member, "member-1"],
    ]) {
      const res = await createDeployment(user.as, t.deploymentsPath, { label });
      expect(res.status).toBe(201);
      expect(res.body.data.deployment.createdBy.id).toBe(user.userId);
    }

    expect(await prisma.deployment.count()).toBe(3);
  });

  it("derives the creator from the session and rejects forged creator fields", async () => {
    const t = await setupTeam();

    const valid = await createDeployment(t.member.as, t.deploymentsPath, { label: "v1.0" });
    expect(valid.body.data.deployment.createdBy).toEqual({ id: t.member.userId, name: "member" });

    const forged = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.1",
      createdById: t.member.userId,
      createdBy: { id: t.member.userId, name: "member" },
    });

    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.deployment.count()).toBe(1);
  });

  it("trims text and stores blank optional fields as null", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "  v2.0  ",
      commitSha: "   ",
      url: "   ",
      notes: "   ",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment).toMatchObject({
      label: "v2.0",
      commitSha: null,
      url: null,
      notes: null,
    });
  });

  it("accepts explicit null optional fields", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v2.1",
      commitSha: null,
      url: null,
      notes: null,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment).toMatchObject({
      label: "v2.1",
      commitSha: null,
      url: null,
      notes: null,
    });
  });

  it("accepts the exact validation limits", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "x".repeat(100),
      commitSha: "a".repeat(40),
      url: `https://example.com/${"p".repeat(2048 - "https://example.com/".length)}`,
      notes: "n".repeat(2000),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deployment.label).toHaveLength(100);
    expect(res.body.data.deployment.commitSha).toHaveLength(40);
    expect(res.body.data.deployment.notes).toHaveLength(2000);
  });

  it("requires authentication", async () => {
    const t = await setupTeam();

    const res = await request(app)
      .post(`/api/v1${t.deploymentsPath}`)
      .set("Origin", WEB_ORIGIN)
      .send({ label: "v1.0" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(await prisma.deployment.count()).toBe(0);
  });

  it("requires a verified email", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.unverified.as, t.deploymentsPath, { label: "v1.0" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(await prisma.deployment.count()).toBe(0);
  });

  it("rejects non-members with the same 404 as a missing organization", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.outsider.as, t.deploymentsPath, { label: "v1.0" });
    const missing = await t.outsider
      .as("post", `/organizations/${randomUUID()}/projects/acme-website/environments/${t.environment.id}/deployments`)
      .send({ label: "v1.0" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(missing.body);
    expect(await prisma.deployment.count()).toBe(0);
  });

  it("rejects a missing, malformed or foreign environment", async () => {
    const t = await setupTeam();
    const base = `/organizations/${t.orgId}/projects/${t.project.slug}/environments`;

    const missing = await createDeployment(
      t.owner.as,
      `${base}/${randomUUID()}/deployments`,
      { label: "v1.0" }
    );
    const malformed = await createDeployment(t.owner.as, `${base}/not-a-uuid/deployments`, {
      label: "v1.0",
    });
    const crossProject = await createDeployment(
      t.owner.as,
      `${base}/${t.portalEnvironment.id}/deployments`,
      { label: "v1.0" }
    );
    const crossTenant = await createDeployment(
      t.owner.as,
      `${base}/${t.rivalEnvironment.id}/deployments`,
      { label: "v1.0" }
    );

    for (const res of [missing, malformed, crossProject, crossTenant]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(await prisma.deployment.count()).toBe(0);
  });
});

describe("deployment validation", () => {
  it.each([
    ["a missing label", {}],
    ["an empty label", { label: "" }],
    ["a whitespace-only label", { label: "   " }],
    ["a 101-character label", { label: "x".repeat(101) }],
    ["a non-hex commit SHA", { label: "v1", commitSha: "zzzzzzz" }],
    ["a 6-character commit SHA", { label: "v1", commitSha: "a".repeat(6) }],
    ["a 41-character commit SHA", { label: "v1", commitSha: "a".repeat(41) }],
    ["an invalid URL", { label: "v1", url: "not-a-url" }],
    ["a javascript: URL", { label: "v1", url: "javascript:alert(1)" }],
    ["a data: URL", { label: "v1", url: "data:text/html,hello" }],
    ["a file: URL", { label: "v1", url: "file:///etc/passwd" }],
    ["an ftp: URL", { label: "v1", url: "ftp://example.com" }],
    ["URL credentials", { label: "v1", url: "https://user:secret@example.com" }],
    ["2,001-character notes", { label: "v1", notes: "n".repeat(2001) }],
  ])("rejects %s", async (_label, body) => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.deployment.count()).toBe(0);
  });

  it("accepts commit SHA boundaries and hexadecimal case", async () => {
    const t = await setupTeam();

    const short = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "short",
      commitSha: "a1b2c3d",
    });
    const long = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "long",
      commitSha: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    });

    expect(short.status).toBe(201);
    expect(long.status).toBe(201);
  });

  it("rejects unknown body fields", async () => {
    const t = await setupTeam();

    const res = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1",
      updatedAt: new Date().toISOString(),
      environmentId: t.preview.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("deployment label uniqueness", () => {
  it("rejects a duplicate label in the same environment with 409", async () => {
    const t = await setupTeam();
    await createDeployment(t.owner.as, t.deploymentsPath, { label: "v1.5" });

    const res = await createDeployment(t.member.as, t.deploymentsPath, { label: "v1.5" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DEPLOYMENT_LABEL_TAKEN");
    expect(await prisma.deployment.count()).toBe(1);
  });

  it("allows the same label in different environments and projects", async () => {
    const t = await setupTeam();

    const first = await createDeployment(t.owner.as, t.deploymentsPath, { label: "v1.5" });
    const second = await createDeployment(t.owner.as, t.previewDeploymentsPath, { label: "v1.5" });
    const third = await createDeployment(t.owner.as, t.portalDeploymentsPath, { label: "v1.5" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);
    expect(await prisma.deployment.count()).toBe(3);
  });

  it("treats labels as case-sensitive", async () => {
    const t = await setupTeam();

    expect((await createDeployment(t.owner.as, t.deploymentsPath, { label: "v1.5" })).status).toBe(201);
    expect((await createDeployment(t.owner.as, t.deploymentsPath, { label: "V1.5" })).status).toBe(201);
    expect(await prisma.deployment.count()).toBe(2);
  });

  it("creates exactly one row when two identical requests race", async () => {
    const t = await setupTeam();

    const [first, second] = await Promise.all([
      createDeployment(t.owner.as, t.deploymentsPath, { label: "race" }),
      createDeployment(t.admin.as, t.deploymentsPath, { label: "race" }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect([first.body.code, second.body.code].sort()).toEqual(
      ["DEPLOYMENT_LABEL_TAKEN", undefined].sort()
    );
    expect(await prisma.deployment.count({ where: { environmentId: t.environment.id } })).toBe(1);
  });

  it("keeps one row after repeated duplicate attempts and can be recovered by listing", async () => {
    const t = await setupTeam();
    const created = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.5",
      commitSha: "a1b2c3d",
    });

    const retry = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.5",
      commitSha: "a1b2c3d",
    });

    expect(retry.status).toBe(409);

    const list = await t.owner.as("get", t.deploymentsPath);
    expect(list.body.data.deployments).toHaveLength(1);
    expect(list.body.data.deployments[0]).toMatchObject({
      id: created.body.data.deployment.id,
      label: "v1.5",
      commitSha: "a1b2c3d",
    });
  });
});

describe("GET deployments", () => {
  it("returns an empty page for an environment without deployments", async () => {
    const t = await setupTeam();

    const res = await t.member.as("get", t.deploymentsPath);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deployments: [], nextCursor: null });
  });

  it("lists deployments newest first", async () => {
    const t = await setupTeam();
    await seedDeployment(t.environment.id, "v1.0", new Date("2026-11-01T09:00:00.000Z"));
    await seedDeployment(t.environment.id, "v1.2", new Date("2026-11-10T09:00:00.000Z"));
    await seedDeployment(t.environment.id, "v1.5", new Date("2026-11-20T09:00:00.000Z"));

    const res = await t.member.as("get", t.deploymentsPath);

    expect(res.body.data.deployments.map((d) => d.label)).toEqual(["v1.5", "v1.2", "v1.0"]);
  });

  it("orders deterministically when timestamps are identical", async () => {
    const t = await setupTeam();
    const sameTime = new Date("2026-11-20T09:00:00.000Z");

    const created = [];
    for (let i = 0; i < 4; i += 1) {
      created.push(await seedDeployment(t.environment.id, `equal-${i}`, sameTime));
    }

    const res = await t.member.as("get", t.deploymentsPath);
    const expected = [...created.map((d) => d.id)].sort().reverse();

    expect(res.body.data.deployments.map((d) => d.id)).toEqual(expected);
  });

  it("scopes the list to the requested environment", async () => {
    const t = await setupTeam();
    await seedDeployment(t.environment.id, "env-one", new Date("2026-11-01T09:00:00.000Z"));
    await seedDeployment(t.preview.id, "env-two", new Date("2026-11-02T09:00:00.000Z"));

    const first = await t.owner.as("get", t.deploymentsPath);
    const second = await t.owner.as("get", t.previewDeploymentsPath);

    expect(first.body.data.deployments.map((d) => d.label)).toEqual(["env-one"]);
    expect(second.body.data.deployments.map((d) => d.label)).toEqual(["env-two"]);
  });

  it("walks pages with the cursor without duplicates or gaps", async () => {
    const t = await setupTeam();
    for (let i = 1; i <= 5; i += 1) {
      await seedDeployment(
        t.environment.id,
        `v1.${i}`,
        new Date(`2026-11-0${i}T09:00:00.000Z`)
      );
    }

    const full = await t.owner.as("get", `${t.deploymentsPath}?limit=100`);
    const expectedIds = full.body.data.deployments.map((d) => d.id);
    expect(expectedIds).toHaveLength(5);

    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const query = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await t.owner.as("get", `${t.deploymentsPath}${query}`);
      expect(res.status).toBe(200);
      expect(res.body.data.deployments.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.data.deployments.map((d) => d.id));
      cursor = res.body.data.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("returns nextCursor null when the page exactly fills the limit", async () => {
    const t = await setupTeam();
    await seedDeployment(t.environment.id, "one", new Date("2026-11-01T09:00:00.000Z"));
    await seedDeployment(t.environment.id, "two", new Date("2026-11-02T09:00:00.000Z"));
    await seedDeployment(t.environment.id, "three", new Date("2026-11-03T09:00:00.000Z"));

    const exact = await t.owner.as("get", `${t.deploymentsPath}?limit=3`);
    expect(exact.body.data.deployments).toHaveLength(3);
    expect(exact.body.data.nextCursor).toBeNull();

    const smaller = await t.owner.as("get", `${t.deploymentsPath}?limit=2`);
    expect(smaller.body.data.deployments).toHaveLength(2);
    expect(smaller.body.data.nextCursor).not.toBeNull();
  });

  it("handles equal timestamps across cursor pages", async () => {
    const t = await setupTeam();
    const sameTime = new Date("2026-11-20T09:00:00.000Z");
    const created = [];
    for (let i = 0; i < 4; i += 1) {
      created.push(await seedDeployment(t.environment.id, `same-${i}`, sameTime));
    }

    const first = await t.owner.as("get", `${t.deploymentsPath}?limit=2`);
    const second = await t.owner.as(
      "get",
      `${t.deploymentsPath}?limit=2&cursor=${encodeURIComponent(first.body.data.nextCursor)}`
    );

    const seen = [
      ...first.body.data.deployments.map((d) => d.id),
      ...second.body.data.deployments.map((d) => d.id),
    ];
    expect(seen).toEqual([...created.map((d) => d.id)].sort().reverse());
    expect(second.body.data.nextCursor).toBeNull();
  });

  it.each(["0", "101", "abc", "1.5"])("rejects limit=%s", async (limit) => {
    const t = await setupTeam();

    const res = await t.owner.as("get", `${t.deploymentsPath}?limit=${limit}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed cursors", async () => {
    const t = await setupTeam();
    const badTimestamp = Buffer.from("not-a-date|11111111-1111-4111-8111-111111111111").toString(
      "base64url"
    );
    const badId = Buffer.from("2026-11-20T09:00:00.000Z|not-a-uuid").toString("base64url");

    for (const cursor of ["not-a-cursor", badTimestamp, badId]) {
      const res = await t.owner.as("get", `${t.deploymentsPath}?cursor=${encodeURIComponent(cursor)}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BAD_REQUEST");
      expect(res.body.message).toBe("Invalid cursor");
    }
  });

  it("rejects an oversized cursor and unknown query parameters", async () => {
    const t = await setupTeam();

    const oversized = await t.owner.as("get", `${t.deploymentsPath}?cursor=${"a".repeat(1025)}`);
    const unknown = await t.owner.as("get", `${t.deploymentsPath}?status=OPEN`);

    expect(oversized.status).toBe(400);
    expect(oversized.body.code).toBe("VALIDATION_ERROR");
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication and membership", async () => {
    const t = await setupTeam();

    const anonymous = await request(app)
      .get(`/api/v1${t.deploymentsPath}`)
      .set("Origin", WEB_ORIGIN);
    const outsider = await t.outsider.as("get", t.deploymentsPath);

    expect(anonymous.status).toBe(401);
    expect(outsider.status).toBe(404);
  });
});

describe("GET single deployment", () => {
  it("returns the same representation as create", async () => {
    const t = await setupTeam();
    const created = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.5",
      commitSha: "a1b2c3d",
      url: "https://staging.example.com",
      notes: "Notes",
    });
    const id = created.body.data.deployment.id;

    const res = await t.member.as("get", `${t.deploymentsPath}/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deployment).toEqual(created.body.data.deployment);
  });

  it("returns 404 for a missing or malformed deployment id", async () => {
    const t = await setupTeam();

    const missing = await t.owner.as("get", `${t.deploymentsPath}/${randomUUID()}`);
    const malformed = await t.owner.as("get", `${t.deploymentsPath}/not-a-uuid`);

    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("NOT_FOUND");
    expect(malformed.status).toBe(404);
    expect(malformed.body.code).toBe("NOT_FOUND");
  });

  it("does not expose a deployment from another environment, project or organization", async () => {
    const t = await setupTeam();

    const previewDeployment = await createDeployment(t.owner.as, t.previewDeploymentsPath, {
      label: "preview-1",
    });
    const portalDeployment = await createDeployment(t.owner.as, t.portalDeploymentsPath, {
      label: "portal-1",
    });
    await createDeployment(t.outsider.as, t.rivalDeploymentsPath, { label: "rival-1" });
    const rivalDeployment = await prisma.deployment.findFirstOrThrow({
      where: { label: "rival-1" },
    });

    const otherEnvironment = await t.owner.as(
      "get",
      `${t.deploymentsPath}/${previewDeployment.body.data.deployment.id}`
    );
    const otherProject = await t.owner.as(
      "get",
      `${t.deploymentsPath}/${portalDeployment.body.data.deployment.id}`
    );
    const otherTenant = await t.owner.as(
      "get",
      `${t.deploymentsPath}/${rivalDeployment.id}`
    );

    for (const res of [otherEnvironment, otherProject, otherTenant]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }

    // The same deployment is readable through its real environment.
    const allowed = await t.owner.as(
      "get",
      `${t.previewDeploymentsPath}/${previewDeployment.body.data.deployment.id}`
    );
    expect(allowed.status).toBe(200);
  });
});

describe("project detail latestDeployment", () => {
  it("returns null for environments without deployments", async () => {
    const t = await setupTeam();

    const res = await t.member.as("get", t.projectPath);

    expect(res.status).toBe(200);
    expect(
      res.body.data.project.environments.find((env) => env.id === t.environment.id).latestDeployment
    ).toBeNull();
  });

  it("returns the newest recorded deployment for each environment", async () => {
    const t = await setupTeam();
    await seedDeployment(t.environment.id, "older", new Date("2026-11-01T09:00:00.000Z"));
    const newest = await seedDeployment(
      t.environment.id,
      "newest",
      new Date("2026-11-20T09:00:00.000Z")
    );
    const previewNewest = await seedDeployment(
      t.preview.id,
      "preview-newest",
      new Date("2026-11-15T09:00:00.000Z")
    );

    const res = await t.member.as("get", t.projectPath);

    const staging = res.body.data.project.environments.find((env) => env.id === t.environment.id);
    const preview = res.body.data.project.environments.find((env) => env.id === t.preview.id);

    expect(staging.latestDeployment).toEqual({
      id: newest.id,
      label: "newest",
      createdAt: newest.createdAt.toISOString(),
    });
    expect(preview.latestDeployment).toEqual({
      id: previewNewest.id,
      label: "preview-newest",
      createdAt: previewNewest.createdAt.toISOString(),
    });
  });

  it("uses id as the tie-breaker for equal timestamps", async () => {
    const t = await setupTeam();
    const sameTime = new Date("2026-11-20T09:00:00.000Z");
    const created = [];
    for (let i = 0; i < 3; i += 1) {
      created.push(await seedDeployment(t.environment.id, `equal-${i}`, sameTime));
    }

    const res = await t.member.as("get", t.projectPath);
    const staging = res.body.data.project.environments.find((env) => env.id === t.environment.id);
    const expectedId = [...created.map((d) => d.id)].sort().reverse()[0];

    expect(staging.latestDeployment.id).toBe(expectedId);
  });

  it("preserves existing project and environment fields", async () => {
    const t = await setupTeam();
    await seedDeployment(t.environment.id, "v1.0", new Date("2026-11-01T09:00:00.000Z"));

    const res = await t.member.as("get", t.projectPath);
    const staging = res.body.data.project.environments.find((env) => env.id === t.environment.id);

    expect(res.body.data.project).toMatchObject({
      id: t.project.id,
      name: "Acme Website",
      slug: t.project.slug,
    });
    expect(Object.keys(staging).sort()).toEqual(
      ["createdAt", "id", "latestDeployment", "name", "slug", "updatedAt", "url"].sort()
    );
    expect(Object.keys(staging.latestDeployment).sort()).toEqual(
      ["createdAt", "id", "label"].sort()
    );
  });
});

describe("deployment immutability", () => {
  it("has no PATCH, PUT or DELETE endpoint and leaves the stored row untouched", async () => {
    const t = await setupTeam();
    const created = await createDeployment(t.owner.as, t.deploymentsPath, {
      label: "v1.5",
      commitSha: "a1b2c3d",
      notes: "Original",
    });
    const id = created.body.data.deployment.id;
    const itemPath = `${t.deploymentsPath}/${id}`;

    const attempts = [
      await t.owner.as("patch", itemPath).send({ label: "hijacked" }),
      await t.owner.as("put", itemPath).send({ label: "hijacked" }),
      await t.owner.as("delete", itemPath),
      await t.owner.as("patch", t.deploymentsPath).send({ label: "hijacked" }),
      await t.owner.as("delete", t.deploymentsPath),
    ];

    for (const res of attempts) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ROUTE_NOT_FOUND");
    }

    const stored = await prisma.deployment.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      label: "v1.5",
      commitSha: "a1b2c3d",
      notes: "Original",
    });
    expect(await prisma.deployment.count()).toBe(1);
  });
});
