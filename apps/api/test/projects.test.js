import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

async function userWithSession(email) {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .set("Origin", WEB_ORIGIN)
    .send(credentials({ email, name: email.split("@")[0] }));
  await waitForPendingMail();

  const access = cookieValue(res, "pf_access");
  const userId = res.body.data.user.id;
  const as = (method, path) =>
    request(app)[method](`/api/v1${path}`).set("Origin", WEB_ORIGIN).set("Cookie", `pf_access=${access}`);

  return { userId, as };
}

async function orgOwnedBy(user, name = "Acme Studio") {
  const res = await user.as("post", "/organizations").send({ name });
  return res.body.data.organization.id;
}

const addMember = (organizationId, userId, role) =>
  prisma.organizationMember.create({ data: { organizationId, userId, role } });

// owner, admin and member of one organization, plus an outsider with their own.
async function team() {
  const owner = await userWithSession("owner@example.com");
  const admin = await userWithSession("admin@example.com");
  const member = await userWithSession("member@example.com");
  const outsider = await userWithSession("outsider@example.com");
  const orgId = await orgOwnedBy(owner);
  const otherOrgId = await orgOwnedBy(outsider, "Rival Agency");
  await addMember(orgId, admin.userId, "ADMIN");
  await addMember(orgId, member.userId, "MEMBER");

  const projects = (user, org = orgId) => `/organizations/${org}/projects`;
  const createProject = async (user, body, org = orgId) =>
    (await user.as("post", projects(user, org)).send(body)).body.data.project;
  const createEnvironment = async (user, slug, body, org = orgId) =>
    (await user.as("post", `${projects(user, org)}/${slug}/environments`).send(body)).body.data.environment;

  return { owner, admin, member, outsider, orgId, otherOrgId, projects, createProject, createEnvironment };
}

const STAGING = { name: "Staging", url: "https://staging.acme.com" };

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /organizations/:orgId/projects", () => {
  it("creates a project and returns a ProjectSummary", async () => {
    const t = await team();

    const res = await t.owner.as("post", t.projects()).send({ name: "  Acme Website  ", description: "Marketing site" });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data.project).sort()).toEqual(
      ["createdAt", "description", "id", "name", "slug", "updatedAt"]
    );
    expect(res.body.data.project).toMatchObject({
      name: "Acme Website",
      slug: "acme-website",
      description: "Marketing site",
    });
  });

  it("stores a blank or missing description as null", async () => {
    const t = await team();

    expect((await t.createProject(t.owner, { name: "Blank", description: "   " })).description).toBeNull();
    expect((await t.createProject(t.owner, { name: "Missing" })).description).toBeNull();
  });

  it.each([
    ["a 1-character name", { name: "A" }],
    ["a 181-character name", { name: "x".repeat(181) }],
    ["a 2,001-character description", { name: "Acme", description: "d".repeat(2001) }],
    ["a missing name", { description: "no name" }],
  ])("rejects %s", async (_label, body) => {
    const t = await team();

    const res = await t.owner.as("post", t.projects()).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.project.count()).toBe(0);
  });

  it("accepts the limits exactly", async () => {
    const t = await team();

    const res = await t.owner
      .as("post", t.projects())
      .send({ name: "x".repeat(180), description: "d".repeat(2000) });

    expect(res.status).toBe(201);
  });
});

describe("project slugs", () => {
  it("are unique within an organization: a repeated name gets a suffix", async () => {
    const t = await team();

    const first = await t.createProject(t.owner, { name: "Acme Website" });
    const second = await t.createProject(t.owner, { name: "Acme Website" });

    expect(first.slug).toBe("acme-website");
    expect(second.slug).toMatch(/^acme-website-[a-f0-9]{6}$/);
  });

  it("can repeat across organizations", async () => {
    const t = await team();

    const ours = await t.createProject(t.owner, { name: "Acme Website" });
    const theirs = await t.createProject(t.outsider, { name: "Acme Website" }, t.otherOrgId);

    expect(ours.slug).toBe("acme-website");
    expect(theirs.slug).toBe("acme-website");
  });

  it("never use a reserved word such as 'new'", async () => {
    const t = await team();

    const project = await t.createProject(t.owner, { name: "New" });

    expect(project.slug).toMatch(/^new-[a-f0-9]{6}$/);
  });

  it("fall back to 'project' when the name has no usable characters", async () => {
    const t = await team();

    expect((await t.createProject(t.owner, { name: "!!!" })).slug).toBe("project");
  });

  it("can't be chosen on create or changed on update", async () => {
    const t = await team();

    const created = await t.createProject(t.owner, { name: "Acme Website", slug: "custom" });
    expect(created.slug).toBe("acme-website");

    const renamed = await t.owner
      .as("patch", `${t.projects()}/acme-website`)
      .send({ name: "Totally New Name", slug: "hijack" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.project.slug).toBe("acme-website");

    const slugOnly = await t.owner.as("patch", `${t.projects()}/acme-website`).send({ slug: "hijack" });
    expect(slugOnly.status).toBe(400);
  });
});

describe("GET projects", () => {
  it("lists the organization's projects, newest first", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "First" });
    await t.createProject(t.owner, { name: "Second" });
    await t.createProject(t.outsider, { name: "Not Ours" }, t.otherOrgId);

    const res = await t.member.as("get", t.projects());

    expect(res.status).toBe(200);
    expect(res.body.data.projects.map((p) => p.name)).toEqual(["Second", "First"]);
  });

  it("returns a ProjectDetail with environments, oldest first", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website" });
    await t.createEnvironment(t.owner, "acme-website", STAGING);
    await t.createEnvironment(t.owner, "acme-website", { name: "Production", url: "https://acme.com" });

    const res = await t.member.as("get", `${t.projects()}/acme-website`);

    expect(res.status).toBe(200);
    expect(res.body.data.project).toMatchObject({ name: "Acme Website", slug: "acme-website" });
    expect(res.body.data.project.environments.map((e) => e.name)).toEqual(["Staging", "Production"]);
    expect(Object.keys(res.body.data.project.environments[0]).sort()).toEqual(
      ["createdAt", "id", "name", "slug", "updatedAt", "url"]
    );
  });

  it("returns 404 for an unknown or malformed project slug", async () => {
    const t = await team();

    expect((await t.owner.as("get", `${t.projects()}/does-not-exist`)).status).toBe(404);
    expect((await t.owner.as("get", `${t.projects()}/Not%20A%20Slug`)).status).toBe(404);
  });

  it("requires authentication", async () => {
    const t = await team();

    const res = await request(app).get(`/api/v1${t.projects()}`);

    expect(res.status).toBe(401);
  });
});

describe("PATCH /projects/:projectSlug", () => {
  it("updates only the fields sent; description null clears it", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website", description: "Original" });
    const path = `${t.projects()}/acme-website`;

    const renamed = await t.owner.as("patch", path).send({ name: "Acme Site" });
    expect(renamed.body.data.project).toMatchObject({ name: "Acme Site", description: "Original" });

    const cleared = await t.owner.as("patch", path).send({ description: null });
    expect(cleared.body.data.project).toMatchObject({ name: "Acme Site", description: null });
  });

  it("rejects an empty body and invalid values", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website" });
    const path = `${t.projects()}/acme-website`;

    expect((await t.owner.as("patch", path).send({})).status).toBe(400);
    expect((await t.owner.as("patch", path).send({ name: "A" })).status).toBe(400);
    expect((await t.owner.as("patch", path).send({ description: "d".repeat(2001) })).status).toBe(400);
  });
});

describe("environments", () => {
  async function withProject() {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website" });
    const envs = `${t.projects()}/acme-website/environments`;
    return { ...t, envs };
  }

  it("creates an environment with a generated slug", async () => {
    const t = await withProject();

    const res = await t.owner.as("post", t.envs).send({ name: "  Staging  ", url: "  https://staging.acme.com/  " });

    expect(res.status).toBe(201);
    expect(res.body.data.environment).toMatchObject({
      name: "Staging",
      slug: "staging",
      url: "https://staging.acme.com/",
    });
  });

  it.each([
    ["http", "http://staging.acme.com"],
    ["localhost with a port", "http://localhost:3000/preview"],
    ["a LAN address", "http://192.168.1.20:8080"],
  ])("accepts %s URLs", async (_label, url) => {
    const t = await withProject();

    expect((await t.owner.as("post", t.envs).send({ name: "Review", url })).status).toBe(201);
  });

  it.each([
    ["a non-http scheme", "ftp://acme.com"],
    ["javascript:", "javascript:alert(1)"],
    ["a missing scheme", "staging.acme.com"],
    ["embedded credentials", "https://user:secret@staging.acme.com"],
    ["an embedded username", "https://admin@staging.acme.com"],
    ["a URL over 2,048 characters", `https://acme.com/${"p".repeat(2048)}`],
  ])("rejects %s", async (_label, url) => {
    const t = await withProject();

    const res = await t.owner.as("post", t.envs).send({ name: "Staging", url });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.environment.count()).toBe(0);
  });

  it.each([
    ["a 1-character name", { name: "S", url: STAGING.url }],
    ["a 101-character name", { name: "x".repeat(101), url: STAGING.url }],
  ])("rejects %s", async (_label, body) => {
    const t = await withProject();

    expect((await t.owner.as("post", t.envs).send(body)).status).toBe(400);
  });

  it("rejects a duplicate name in the same project, ignoring case", async () => {
    const t = await withProject();
    await t.owner.as("post", t.envs).send(STAGING);

    const res = await t.owner.as("post", t.envs).send({ name: "STAGING", url: "https://other.acme.com" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ENVIRONMENT_NAME_TAKEN");
  });

  it("allows the same name in different projects", async () => {
    const t = await withProject();
    await t.createProject(t.owner, { name: "Second Site" });

    await t.owner.as("post", t.envs).send(STAGING);
    const res = await t.owner.as("post", `${t.projects()}/second-site/environments`).send(STAGING);

    expect(res.status).toBe(201);
  });

  it("updates name and URL but keeps the slug", async () => {
    const t = await withProject();
    const env = await t.createEnvironment(t.owner, "acme-website", STAGING);

    const res = await t.owner
      .as("patch", `${t.envs}/${env.id}`)
      .send({ name: "Pre-production", url: "https://pre.acme.com" });

    expect(res.status).toBe(200);
    expect(res.body.data.environment).toMatchObject({
      id: env.id,
      name: "Pre-production",
      slug: "staging",
      url: "https://pre.acme.com",
    });
  });

  it("gives a reused name a fresh slug when the old slug belongs to a renamed environment", async () => {
    const t = await withProject();
    const env = await t.createEnvironment(t.owner, "acme-website", STAGING);
    await t.owner.as("patch", `${t.envs}/${env.id}`).send({ name: "Pre-production" });

    const res = await t.owner.as("post", t.envs).send(STAGING);

    expect(res.status).toBe(201);
    expect(res.body.data.environment.slug).toMatch(/^staging-[a-f0-9]{6}$/);
  });

  it("rejects renaming to another environment's name, but allows a case change of its own", async () => {
    const t = await withProject();
    const staging = await t.createEnvironment(t.owner, "acme-website", STAGING);
    await t.createEnvironment(t.owner, "acme-website", { name: "Production", url: "https://acme.com" });

    const clash = await t.owner.as("patch", `${t.envs}/${staging.id}`).send({ name: "production" });
    const ownCase = await t.owner.as("patch", `${t.envs}/${staging.id}`).send({ name: "STAGING" });

    expect(clash.status).toBe(409);
    expect(ownCase.status).toBe(200);
  });

  it("rejects an empty or invalid update", async () => {
    const t = await withProject();
    const env = await t.createEnvironment(t.owner, "acme-website", STAGING);

    expect((await t.owner.as("patch", `${t.envs}/${env.id}`).send({})).status).toBe(400);
    expect((await t.owner.as("patch", `${t.envs}/${env.id}`).send({ url: "ftp://x.com" })).status).toBe(400);
  });

  it("returns 404 for an unknown or malformed environment id", async () => {
    const t = await withProject();

    expect((await t.owner.as("patch", `${t.envs}/${randomUUID()}`).send({ name: "Gone" })).status).toBe(404);
    expect((await t.owner.as("patch", `${t.envs}/not-a-uuid`).send({ name: "Gone" })).status).toBe(404);
  });
});

describe("permissions", () => {
  it("lets OWNER and ADMIN create and edit projects and environments", async () => {
    const t = await team();

    for (const user of [t.owner, t.admin]) {
      const project = await t.createProject(user, { name: `By ${user.userId.slice(0, 4)}` });
      const path = `${t.projects()}/${project.slug}`;

      expect((await user.as("patch", path).send({ name: "Edited" })).status).toBe(200);

      const env = await user.as("post", `${path}/environments`).send(STAGING);
      expect(env.status).toBe(201);
      expect(
        (await user.as("patch", `${path}/environments/${env.body.data.environment.id}`).send({ name: "QA" })).status
      ).toBe(200);
    }
  });

  it("lets a MEMBER view but not create or edit anything", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website" });
    const env = await t.createEnvironment(t.owner, "acme-website", STAGING);
    const path = `${t.projects()}/acme-website`;

    expect((await t.member.as("get", t.projects())).status).toBe(200);
    expect((await t.member.as("get", path)).status).toBe(200);

    const attempts = [
      await t.member.as("post", t.projects()).send({ name: "Sneaky" }),
      await t.member.as("patch", path).send({ name: "Sneaky" }),
      await t.member.as("post", `${path}/environments`).send({ name: "Sneaky", url: "https://x.com" }),
      await t.member.as("patch", `${path}/environments/${env.id}`).send({ name: "Sneaky" }),
    ];

    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(await prisma.project.count()).toBe(1);
    expect((await prisma.project.findFirstOrThrow()).name).toBe("Acme Website");
    expect((await prisma.environment.findFirstOrThrow()).name).toBe("Staging");
  });

  it("checks the role before validating, so a MEMBER learns nothing from bad input", async () => {
    const t = await team();

    const res = await t.member.as("post", t.projects()).send({ name: "A" });

    expect(res.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("hides another organization's projects behind the same 404 as a missing org", async () => {
    const t = await team();
    await t.createProject(t.outsider, { name: "Rival Site" }, t.otherOrgId);
    const theirs = `/organizations/${t.otherOrgId}/projects`;

    const list = await t.owner.as("get", theirs);
    const detail = await t.owner.as("get", `${theirs}/rival-site`);
    const create = await t.owner.as("post", theirs).send({ name: "Planted" });
    const missingOrg = await t.owner.as("get", `/organizations/${randomUUID()}/projects`);

    for (const res of [list, detail, create]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missingOrg.body);
    }
    expect(await prisma.project.count({ where: { organizationId: t.otherOrgId } })).toBe(1);
  });

  it("can't reach another organization's project through your own organization's URL", async () => {
    const t = await team();
    await t.createProject(t.outsider, { name: "Rival Site" }, t.otherOrgId);

    const res = await t.owner.as("get", `${t.projects()}/rival-site`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Project not found");
  });

  it("can't edit an environment through a different project's URL", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Site A" });
    await t.createProject(t.owner, { name: "Site B" });
    const envOfA = await t.createEnvironment(t.owner, "site-a", STAGING);

    const res = await t.owner
      .as("patch", `${t.projects()}/site-b/environments/${envOfA.id}`)
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Environment not found");
    expect((await prisma.environment.findUniqueOrThrow({ where: { id: envOfA.id } })).name).toBe("Staging");
  });

  it("can't edit another organization's environment even with its id", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Our Site" });
    await t.createProject(t.outsider, { name: "Rival Site" }, t.otherOrgId);
    const theirEnv = await t.createEnvironment(t.outsider, "rival-site", STAGING, t.otherOrgId);

    const res = await t.owner
      .as("patch", `${t.projects()}/our-site/environments/${theirEnv.id}`)
      .send({ url: "https://evil.example" });

    expect(res.status).toBe(404);
    expect((await prisma.environment.findUniqueOrThrow({ where: { id: theirEnv.id } })).url).toBe(STAGING.url);
  });

  it("loses access as soon as the membership is removed", async () => {
    const t = await team();
    await t.createProject(t.owner, { name: "Acme Website" });

    expect((await t.member.as("get", `${t.projects()}/acme-website`)).status).toBe(200);
    await prisma.organizationMember.deleteMany({ where: { userId: t.member.userId } });
    expect((await t.member.as("get", `${t.projects()}/acme-website`)).status).toBe(404);
  });
});
