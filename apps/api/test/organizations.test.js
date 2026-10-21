import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

const BASE = "/api/v1/organizations";

async function userWithSession(email) {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .set("Origin", WEB_ORIGIN)
    .send(credentials({ email, name: email.split("@")[0] }));
  await waitForPendingMail();

  const access = cookieValue(res, "pf_access");
  const userId = res.body.data.user.id;
  const as = (method, path = "") =>
    request(app)[method](`${BASE}${path}`).set("Origin", WEB_ORIGIN).set("Cookie", `pf_access=${access}`);

  return { userId, access, as };
}

async function createOrg(owner, name = "Acme Studio") {
  const res = await owner.as("post").send({ name });
  return res.body.data.organization;
}

async function addMember(orgId, userId, role) {
  await prisma.organizationMember.create({ data: { organizationId: orgId, userId, role } });
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /organizations", () => {
  it("creates the organization with the creator as OWNER", async () => {
    const owner = await userWithSession("owner@example.com");

    const res = await owner.as("post").send({ name: "  Acme Studio & Co. " });

    expect(res.status).toBe(201);
    expect(res.body.data.organization).toMatchObject({
      name: "Acme Studio & Co.",
      slug: "acme-studio-co",
      role: "OWNER",
    });

    const membership = await prisma.organizationMember.findFirstOrThrow();
    expect(membership).toMatchObject({ userId: owner.userId, role: "OWNER" });
  });

  it("accepts an explicit slug and rejects a taken one", async () => {
    const owner = await userWithSession("owner@example.com");

    const first = await owner.as("post").send({ name: "Acme", slug: "Acme-HQ" });
    const taken = await owner.as("post").send({ name: "Other", slug: "acme-hq" });

    expect(first.body.data.organization.slug).toBe("acme-hq");
    expect(taken.status).toBe(409);
    expect(await prisma.organization.count()).toBe(1);
  });

  it("gives a derived slug a suffix instead of failing when it's taken", async () => {
    const owner = await userWithSession("owner@example.com");

    const first = await createOrg(owner, "Acme Studio");
    const second = await createOrg(owner, "Acme Studio");

    expect(first.slug).toBe("acme-studio");
    expect(second.slug).toMatch(/^acme-studio-[a-f0-9]{6}$/);
  });

  it.each([
    ["too-short name", { name: "A" }],
    ["invalid slug", { name: "Acme", slug: "Not a slug!" }],
    ["name with no usable slug", { name: "!!!" }],
  ])("rejects a %s", async (_label, body) => {
    const owner = await userWithSession("owner@example.com");

    const res = await owner.as("post").send(body);

    expect(res.status).toBe(400);
    expect(await prisma.organization.count()).toBe(0);
  });

  it("requires authentication", async () => {
    const res = await request(app).post(BASE).set("Origin", WEB_ORIGIN).send({ name: "Acme" });

    expect(res.status).toBe(401);
  });

  it("shows up in /auth/me", async () => {
    const owner = await userWithSession("owner@example.com");
    const org = await createOrg(owner);

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", `pf_access=${owner.access}`);

    expect(me.body.data.memberships).toEqual([
      { role: "OWNER", organization: { id: org.id, name: "Acme Studio", slug: "acme-studio" } },
    ]);
  });
});

describe("GET /organizations", () => {
  it("lists only the caller's organizations, with their role in each", async () => {
    const alice = await userWithSession("alice@example.com");
    const bob = await userWithSession("bob@example.com");
    const aliceOrg = await createOrg(alice, "Alice Agency");
    await createOrg(bob, "Bob Agency");
    const shared = await createOrg(bob, "Shared Client");
    await addMember(shared.id, alice.userId, "MEMBER");

    const res = await alice.as("get");

    expect(res.status).toBe(200);
    expect(res.body.data.organizations.map((o) => [o.id, o.role])).toEqual([
      [aliceOrg.id, "OWNER"],
      [shared.id, "MEMBER"],
    ]);
  });
});

describe("organization isolation", () => {
  it("hides another organization behind the same 404 as a missing one", async () => {
    const alice = await userWithSession("alice@example.com");
    const bob = await userWithSession("bob@example.com");
    const bobOrg = await createOrg(bob, "Bob Agency");

    const otherOrg = await alice.as("get", `/${bobOrg.id}`);
    const missing = await alice.as("get", `/${randomUUID()}`);
    const malformed = await alice.as("get", "/not-a-uuid");

    expect(otherOrg.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(otherOrg.body).toEqual(missing.body);
    expect(otherOrg.body).toEqual(malformed.body);
  });

  it("blocks every route on another organization, including writes", async () => {
    const alice = await userWithSession("alice@example.com");
    const bob = await userWithSession("bob@example.com");
    const bobOrg = await createOrg(bob, "Bob Agency");

    const members = await alice.as("get", `/${bobOrg.id}/members`);
    const rename = await alice.as("patch", `/${bobOrg.id}`).send({ name: "Hijacked" });

    expect(members.status).toBe(404);
    expect(rename.status).toBe(404);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: bobOrg.id } })).name).toBe("Bob Agency");
  });

  it("loses access as soon as the membership is removed", async () => {
    const owner = await userWithSession("owner@example.com");
    const member = await userWithSession("member@example.com");
    const org = await createOrg(owner);
    await addMember(org.id, member.userId, "MEMBER");

    expect((await member.as("get", `/${org.id}`)).status).toBe(200);

    await prisma.organizationMember.deleteMany({ where: { userId: member.userId } });

    expect((await member.as("get", `/${org.id}`)).status).toBe(404);
  });
});

describe("roles within an organization", () => {
  async function orgWithRoles() {
    const owner = await userWithSession("owner@example.com");
    const admin = await userWithSession("admin@example.com");
    const member = await userWithSession("member@example.com");
    const org = await createOrg(owner);
    await addMember(org.id, admin.userId, "ADMIN");
    await addMember(org.id, member.userId, "MEMBER");
    return { owner, admin, member, org };
  }

  it("lets any member view the organization and its members", async () => {
    const { member, org } = await orgWithRoles();

    const view = await member.as("get", `/${org.id}`);
    const members = await member.as("get", `/${org.id}/members`);

    expect(view.status).toBe(200);
    expect(view.body.data.organization.role).toBe("MEMBER");
    expect(members.status).toBe(200);
    expect(members.body.data.members.map((m) => m.role)).toEqual(["OWNER", "ADMIN", "MEMBER"]);
    expect(JSON.stringify(members.body)).not.toContain("passwordHash");
  });

  it("lets OWNER and ADMIN rename, but returns 403 for a MEMBER", async () => {
    const { owner, admin, member, org } = await orgWithRoles();

    const byMember = await member.as("patch", `/${org.id}`).send({ name: "Member Rename" });
    const byAdmin = await admin.as("patch", `/${org.id}`).send({ name: "Admin Rename" });
    const byOwner = await owner.as("patch", `/${org.id}`).send({ name: "Owner Rename" });

    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe("FORBIDDEN");
    expect(byAdmin.status).toBe(200);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.organization).toMatchObject({ name: "Owner Rename", slug: "acme-studio" });
  });

  it("ignores attempts to change the slug on rename", async () => {
    const { owner, org } = await orgWithRoles();

    const res = await owner.as("patch", `/${org.id}`).send({ name: "New Name", slug: "new-slug" });

    expect(res.status).toBe(200);
    expect(res.body.data.organization.slug).toBe("acme-studio");
  });
});
