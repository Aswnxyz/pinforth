import { randomUUID } from "node:crypto";
import pg from "pg";
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

// owner, admin, member and a second member of one organization.
async function team() {
  const owner = await userWithSession("owner@example.com");
  const admin = await userWithSession("admin@example.com");
  const member = await userWithSession("member@example.com");
  const member2 = await userWithSession("member2@example.com");
  const orgId = (await owner.as("post", "/organizations").send({ name: "Acme Studio" })).body.data.organization.id;
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgId, userId: admin.userId, role: "ADMIN" },
      { organizationId: orgId, userId: member.userId, role: "MEMBER" },
      { organizationId: orgId, userId: member2.userId, role: "MEMBER" },
    ],
  });

  const idOf = async (user) =>
    (await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgId, userId: user.userId } },
    })).id;

  const members = `/organizations/${orgId}/members`;
  const setRole = async (actor, target, role) => actor.as("patch", `${members}/${await idOf(target)}`).send({ role });
  const remove = async (actor, target) => actor.as("delete", `${members}/${await idOf(target)}`);
  const roleOf = async (user) =>
    (await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.userId } },
    }))?.role ?? null;

  return { owner, admin, member, member2, orgId, members, idOf, setRole, remove, roleOf };
}

// Holds row locks from a separate connection while `fn` runs, and always
// releases them, so a failed assertion can't leave later tests blocked.
async function withRowsLocked(sql, params, fn) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query(sql, params);
    await fn(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /organizations/:orgId/members", () => {
  it("marks the caller's own row with isYou", async () => {
    const t = await team();

    const res = await t.member.as("get", t.members);

    expect(res.status).toBe(200);
    const mine = res.body.data.members.filter((m) => m.isYou);
    expect(mine).toHaveLength(1);
    expect(mine[0].user.email).toBe("member@example.com");
    expect(Object.keys(mine[0]).sort()).toEqual(["id", "isYou", "joinedAt", "role", "user"]);
  });
});

describe("PATCH /organizations/:orgId/members/:memberId (change role)", () => {
  it("lets an OWNER set any role, including granting OWNER", async () => {
    const t = await team();

    const promoted = await t.setRole(t.owner, t.member, "ADMIN");
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.member).toMatchObject({ role: "ADMIN", isYou: false });

    expect((await t.setRole(t.owner, t.admin, "OWNER")).status).toBe(200);
    expect((await t.setRole(t.owner, t.admin, "MEMBER")).status).toBe(200);
    expect(await t.roleOf(t.admin)).toBe("MEMBER");
  });

  it("gives ADMIN and MEMBER 403, even for their own role", async () => {
    const t = await team();

    for (const res of [
      await t.setRole(t.admin, t.member, "ADMIN"),
      await t.setRole(t.admin, t.admin, "OWNER"),
      await t.setRole(t.member, t.member, "ADMIN"),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(await t.roleOf(t.admin)).toBe("ADMIN");
    expect(await t.roleOf(t.member)).toBe("MEMBER");
  });

  it("rejects an invalid role", async () => {
    const t = await team();

    const res = await t.setRole(t.owner, t.member, "SUPERUSER");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("won't demote the last OWNER, including themselves", async () => {
    const t = await team();

    const res = await t.setRole(t.owner, t.owner, "ADMIN");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_OWNER");
    expect(await t.roleOf(t.owner)).toBe("OWNER");
  });

  it("allows an OWNER to step down once there's another OWNER", async () => {
    const t = await team();
    await t.setRole(t.owner, t.admin, "OWNER");

    expect((await t.setRole(t.owner, t.owner, "ADMIN")).status).toBe(200);
    expect(await t.roleOf(t.owner)).toBe("ADMIN");
  });

  it("never leaves zero owners when two owners demote each other at once", async () => {
    const t = await team();
    await t.setRole(t.owner, t.admin, "OWNER");
    const [ownerId, adminId] = [await t.idOf(t.owner), await t.idOf(t.admin)];

    const results = await Promise.all([
      t.owner.as("patch", `${t.members}/${adminId}`).send({ role: "MEMBER" }),
      t.admin.as("patch", `${t.members}/${ownerId}`).send({ role: "MEMBER" }),
    ]);

    // Whichever runs second either finds itself no longer an owner (403) or
    // the other already demoted (409). Either way one owner remains.
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.organizationMember.count({ where: { organizationId: t.orgId, role: "OWNER" } })).toBe(1);
  });

  it("never leaves zero owners when two owners step down at once", async () => {
    const t = await team();
    await t.setRole(t.owner, t.admin, "OWNER");

    const results = await Promise.all([t.setRole(t.owner, t.owner, "ADMIN"), t.setRole(t.admin, t.admin, "ADMIN")]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.organizationMember.count({ where: { organizationId: t.orgId, role: "OWNER" } })).toBe(1);
  });

  // Deterministic proof that ALL owner rows are locked, not just the ones a
  // request touches: two owners stepping down at once each touch only their own
  // row, so without this they'd both see "2 owners" and leave none.
  it("locks every owner row, so an owner stepping down waits for the other owner", async () => {
    const t = await team();
    await t.setRole(t.owner, t.admin, "OWNER");

    let finished = false;
    let pending;

    // Hold only the OTHER owner's row.
    await withRowsLocked(`SELECT id FROM "OrganizationMember" WHERE "userId" = $1 FOR UPDATE`, [t.admin.userId], async () => {
      pending = t.setRole(t.owner, t.owner, "ADMIN").then((res) => {
        finished = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(finished).toBe(false);
    });

    expect((await pending).status).toBe(200);
  });

  it("re-checks the caller's role inside the lock, so a just-demoted owner is refused", async () => {
    const t = await team();
    await t.setRole(t.owner, t.admin, "OWNER");
    let pending;

    await withRowsLocked(
      `SELECT id FROM "OrganizationMember" WHERE "organizationId" = $1 AND role = 'OWNER' FOR UPDATE`,
      [t.orgId],
      async (client) => {
        // The admin-turned-owner passes the route's role check, then waits on the lock…
        pending = t.setRole(t.admin, t.member, "ADMIN");
        await new Promise((resolve) => setTimeout(resolve, 300));
        // …while they're demoted in the transaction holding it.
        await client.query(`UPDATE "OrganizationMember" SET role = 'MEMBER' WHERE "userId" = $1`, [t.admin.userId]);
      }
    );

    expect((await pending).status).toBe(403);
    expect(await t.roleOf(t.member)).toBe("MEMBER");
  });
});

describe("DELETE /organizations/:orgId/members/:memberId (remove or leave)", () => {
  it("lets an OWNER remove anyone else", async () => {
    const t = await team();
    await t.setRole(t.owner, t.member2, "OWNER");

    for (const target of [t.admin, t.member, t.member2]) {
      expect((await t.remove(t.owner, target)).status).toBe(200);
      expect(await t.roleOf(target)).toBeNull();
    }
  });

  it("lets an ADMIN remove a MEMBER but not an ADMIN or OWNER", async () => {
    const t = await team();
    const otherAdmin = await userWithSession("admin2@example.com");
    await prisma.organizationMember.create({ data: { organizationId: t.orgId, userId: otherAdmin.userId, role: "ADMIN" } });

    expect((await t.remove(t.admin, t.member)).status).toBe(200);
    expect((await t.remove(t.admin, otherAdmin)).status).toBe(403);
    expect((await t.remove(t.admin, t.owner)).status).toBe(403);
    expect(await t.roleOf(otherAdmin)).toBe("ADMIN");
    expect(await t.roleOf(t.owner)).toBe("OWNER");
  });

  it("doesn't let a MEMBER remove anyone else", async () => {
    const t = await team();

    const res = await t.remove(t.member, t.member2);

    expect(res.status).toBe(403);
    expect(await t.roleOf(t.member2)).toBe("MEMBER");
  });

  it("lets anyone leave by removing themselves", async () => {
    const t = await team();

    for (const user of [t.member, t.admin]) {
      const res = await t.remove(user, user);
      expect(res.status).toBe(200);
      expect(await t.roleOf(user)).toBeNull();
    }
  });

  it("won't let the last OWNER leave, but will once there's another", async () => {
    const t = await team();

    const blocked = await t.remove(t.owner, t.owner);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("LAST_OWNER");

    await t.setRole(t.owner, t.admin, "OWNER");
    expect((await t.remove(t.owner, t.owner)).status).toBe(200);
  });

  it("cuts off access as soon as someone is removed", async () => {
    const t = await team();
    expect((await t.member.as("get", `/organizations/${t.orgId}`)).status).toBe(200);

    await t.remove(t.owner, t.member);

    expect((await t.member.as("get", `/organizations/${t.orgId}`)).status).toBe(404);
    expect((await t.member.as("get", t.members)).status).toBe(404);
  });
});

describe("isolation and errors", () => {
  it("returns 404 for unknown or malformed member ids", async () => {
    const t = await team();

    for (const id of [randomUUID(), "not-a-uuid"]) {
      expect((await t.owner.as("patch", `${t.members}/${id}`).send({ role: "ADMIN" })).status).toBe(404);
      expect((await t.owner.as("delete", `${t.members}/${id}`)).status).toBe(404);
    }
  });

  it("can't change or remove a member of another organization", async () => {
    const t = await team();
    const rival = await userWithSession("rival@example.com");
    const rivalOrg = (await rival.as("post", "/organizations").send({ name: "Rival" })).body.data.organization.id;
    const rivalMemberId = (await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: rivalOrg } })).id;

    // Our OWNER, using our org's URL with their member id.
    expect((await t.owner.as("patch", `${t.members}/${rivalMemberId}`).send({ role: "MEMBER" })).status).toBe(404);
    expect((await t.owner.as("delete", `${t.members}/${rivalMemberId}`)).status).toBe(404);

    // And their org's URL is closed to us entirely.
    expect((await t.owner.as("delete", `/organizations/${rivalOrg}/members/${rivalMemberId}`)).status).toBe(404);

    expect((await prisma.organizationMember.findUniqueOrThrow({ where: { id: rivalMemberId } })).role).toBe("OWNER");
  });

  it("requires authentication", async () => {
    const t = await team();

    expect((await request(app).get(`/api/v1${t.members}`)).status).toBe(401);
  });
});
