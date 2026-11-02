import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { testOutbox, waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/modules/auth/tokens.js";
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

async function team() {
  const owner = await userWithSession("owner@example.com");
  const admin = await userWithSession("admin@example.com");
  const member = await userWithSession("member@example.com");
  const orgId = (await owner.as("post", "/organizations").send({ name: "Acme Studio" })).body.data.organization.id;
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgId, userId: admin.userId, role: "ADMIN" },
      { organizationId: orgId, userId: member.userId, role: "MEMBER" },
    ],
  });
  await waitForPendingMail();
  testOutbox.length = 0;

  const invitations = `/organizations/${orgId}/invitations`;
  const invite = async (user, body) => {
    const res = await user.as("post", invitations).send(body);
    await waitForPendingMail();
    return res;
  };

  return { owner, admin, member, orgId, invitations, invite };
}

const tokenFromLastEmail = () => {
  const match = testOutbox.at(-1)?.text.match(/\/invite\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No invite link in the last email");
  return match[1];
};

const preview = (token) => request(app).get(`/api/v1/invitations/${token}`);

const accept = (user, token) => user.as("post", "/invitations/accept").send({ token });

const membershipOf = (orgId, userId) =>
  prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } });

beforeEach(async () => {
  await resetDatabase();
  testOutbox.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /organizations/:orgId/invitations", () => {
  it("creates a pending invitation and emails a link", async () => {
    const t = await team();

    const res = await t.invite(t.owner, { email: "  New.Person@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.data.invitation).toMatchObject({
      email: "new.person@example.com",
      role: "MEMBER",
      status: "pending",
      invitedBy: { id: t.owner.userId, name: "owner" },
    });
    expect(Object.keys(res.body.data.invitation).sort()).toEqual(
      ["createdAt", "email", "expiresAt", "id", "invitedBy", "role", "status"]
    );

    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].to).toBe("new.person@example.com");
    expect(testOutbox[0].subject).toBe("owner invited you to join Acme Studio on Pinforth");
    expect(testOutbox[0].text).toContain("http://localhost:3000/invite?token=");

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(tokenFromLastEmail()));
  });

  it("expires after 7 days", async () => {
    const t = await team();

    const res = await t.invite(t.owner, { email: "new@example.com" });
    const days = (new Date(res.body.data.invitation.expiresAt) - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("can invite as ADMIN but never as OWNER", async () => {
    const t = await team();

    expect((await t.invite(t.owner, { email: "a@example.com", role: "ADMIN" })).body.data.invitation.role).toBe("ADMIN");

    const asOwner = await t.invite(t.owner, { email: "b@example.com", role: "OWNER" });
    expect(asOwner.status).toBe(400);
    expect(asOwner.body.code).toBe("VALIDATION_ERROR");
  });

  it.each([["an invalid email", { email: "not-an-email" }], ["a missing email", { role: "MEMBER" }]])(
    "rejects %s",
    async (_label, body) => {
      const t = await team();

      expect((await t.invite(t.owner, body)).status).toBe(400);
      expect(await prisma.invitation.count()).toBe(0);
    }
  );

  it("rejects someone who is already a member", async () => {
    const t = await team();

    const res = await t.invite(t.owner, { email: "MEMBER@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_MEMBER");
  });

  it("rejects a second pending invite for the same email and points to the first", async () => {
    const t = await team();
    const first = await t.invite(t.owner, { email: "new@example.com" });

    const second = await t.invite(t.admin, { email: "NEW@example.com" });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("INVITATION_PENDING");
    expect(second.body.details).toEqual({ invitationId: first.body.data.invitation.id });
  });

  // Deterministic proof of the per-email lock: while the test holds it, an
  // invite for that email must wait. (Concurrent requests alone rarely overlap
  // closely enough in tests to show the race.)
  it("serialises invites for the same email with a database lock", async () => {
    const t = await team();
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${t.orgId}:race@example.com`]);

    let finished = false;
    const pending = t.owner
      .as("post", t.invitations)
      .send({ email: "race@example.com" })
      .then((res) => {
        finished = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(finished).toBe(false);

    await client.query("COMMIT");
    await client.end();
    expect((await pending).status).toBe(201);
  });

  it("creates only one invite when the same email is invited many times at once", async () => {
    const t = await team();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? t.owner : t.admin).as("post", t.invitations).send({ email: "race@example.com" })
      )
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await prisma.invitation.count()).toBe(1);
  });

  it("allows a new invite once the previous one was revoked or expired", async () => {
    const t = await team();
    const revoked = await t.invite(t.owner, { email: "again@example.com" });
    await t.owner.as("delete", `${t.invitations}/${revoked.body.data.invitation.id}`);

    expect((await t.invite(t.owner, { email: "again@example.com" })).status).toBe(201);

    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await t.invite(t.owner, { email: "again@example.com" })).status).toBe(201);
  });
});

describe("permissions", () => {
  it("lets OWNER and ADMIN manage invites", async () => {
    const t = await team();

    for (const [user, email] of [[t.owner, "x@example.com"], [t.admin, "y@example.com"]]) {
      const created = await t.invite(user, { email });
      expect(created.status).toBe(201);
      const id = created.body.data.invitation.id;

      expect((await user.as("get", t.invitations)).status).toBe(200);
      expect((await user.as("post", `${t.invitations}/${id}/resend`)).status).toBe(200);
      expect((await user.as("delete", `${t.invitations}/${id}`)).status).toBe(200);
    }
  });

  it("gives a MEMBER 403 on every invitation route", async () => {
    const t = await team();
    const id = (await t.invite(t.owner, { email: "x@example.com" })).body.data.invitation.id;

    const attempts = [
      await t.member.as("post", t.invitations).send({ email: "sneaky@example.com" }),
      await t.member.as("get", t.invitations),
      await t.member.as("post", `${t.invitations}/${id}/resend`),
      await t.member.as("delete", `${t.invitations}/${id}`),
    ];

    for (const res of attempts) expect(res.status).toBe(403);
    expect(await prisma.invitation.count()).toBe(1);
  });

  it("requires the inviter to have a verified email", async () => {
    const t = await team();
    await prisma.user.update({ where: { id: t.owner.userId }, data: { emailVerifiedAt: null } });

    const res = await t.invite(t.owner, { email: "x@example.com" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(testOutbox).toHaveLength(0);
  });

  it("hides another organization's invitations behind 404", async () => {
    const t = await team();
    const outsider = await userWithSession("outsider@example.com");
    const id = (await t.invite(t.owner, { email: "x@example.com" })).body.data.invitation.id;

    const list = await outsider.as("get", t.invitations);
    const create = await outsider.as("post", t.invitations).send({ email: "planted@example.com" });
    expect(list.status).toBe(404);
    expect(create.status).toBe(404);

    // Their own org can't reach our invitation by id either.
    const otherOrg = (await outsider.as("post", "/organizations").send({ name: "Rival" })).body.data.organization.id;
    const resend = await outsider.as("post", `/organizations/${otherOrg}/invitations/${id}/resend`);
    const revoke = await outsider.as("delete", `/organizations/${otherOrg}/invitations/${id}`);
    expect(resend.status).toBe(404);
    expect(revoke.status).toBe(404);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id } })).revokedAt).toBeNull();
  });

  it("requires authentication", async () => {
    const t = await team();

    expect((await request(app).get(`/api/v1${t.invitations}`)).status).toBe(401);
  });
});

describe("GET /organizations/:orgId/invitations", () => {
  it("lists open invites newest first, with expired ones marked", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "old@example.com" });
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await t.invite(t.owner, { email: "new@example.com" });
    const revoked = await t.invite(t.owner, { email: "gone@example.com" });
    await t.owner.as("delete", `${t.invitations}/${revoked.body.data.invitation.id}`);

    const res = await t.admin.as("get", t.invitations);

    expect(res.body.data.invitations.map((i) => [i.email, i.status])).toEqual([
      ["new@example.com", "pending"],
      ["old@example.com", "expired"],
    ]);
  });
});

describe("resend and revoke", () => {
  it("resend issues a new link, kills the old one and extends expiry", async () => {
    const t = await team();
    const created = await t.invite(t.owner, { email: "new@example.com" });
    const oldToken = tokenFromLastEmail();
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await t.owner.as("post", `${t.invitations}/${created.body.data.invitation.id}/resend`);
    await waitForPendingMail();
    const newToken = tokenFromLastEmail();

    expect(res.status).toBe(200);
    expect(res.body.data.invitation.status).toBe("pending");
    expect(newToken).not.toBe(oldToken);
    expect(testOutbox).toHaveLength(2);
    expect((await preview(oldToken)).status).toBe(404);
    expect((await preview(newToken)).status).toBe(200);
  });

  it("revoke stops the link working", async () => {
    const t = await team();
    const created = await t.invite(t.owner, { email: "new@example.com" });
    const token = tokenFromLastEmail();

    const res = await t.owner.as("delete", `${t.invitations}/${created.body.data.invitation.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invitation.status).toBe("revoked");
    expect((await preview(token)).status).toBe(404);
    expect((await t.owner.as("delete", `${t.invitations}/${created.body.data.invitation.id}`)).status).toBe(404);
  });

  it("returns 404 for unknown, malformed or accepted invitation ids", async () => {
    const t = await team();
    const created = await t.invite(t.owner, { email: "joiner@example.com" });
    const token = tokenFromLastEmail();
    const joiner = await userWithSession("joiner@example.com");
    await accept(joiner, token);

    for (const id of [randomUUID(), "not-a-uuid", created.body.data.invitation.id]) {
      expect((await t.owner.as("post", `${t.invitations}/${id}/resend`)).status).toBe(404);
      expect((await t.owner.as("delete", `${t.invitations}/${id}`)).status).toBe(404);
    }
  });
});

describe("GET /invitations/:token (preview)", () => {
  it("shows the organization, role, inviter and invited email, without ids", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "new@example.com", role: "ADMIN" });

    const res = await preview(tokenFromLastEmail());

    expect(res.status).toBe(200);
    expect(res.body.data.invitation).toEqual({
      organization: { name: "Acme Studio", slug: "acme-studio" },
      email: "new@example.com",
      role: "ADMIN",
      invitedBy: { name: "owner" },
      expiresAt: expect.any(String),
    });
  });

  it("is 404 for an unknown, malformed or used link and 410 for an expired one", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "new@example.com" });
    const token = tokenFromLastEmail();

    expect((await preview("x".repeat(43))).body.code).toBe("INVITATION_INVALID");
    expect((await preview("short")).status).toBe(404);

    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await preview(token);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe("INVITATION_EXPIRED");
  });
});

describe("POST /invitations/accept", () => {
  it("lets a brand-new user sign up with the invited email and join", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "newbie@example.com", role: "ADMIN" });
    const token = tokenFromLastEmail();

    // Signs up from the invite page, not yet verified.
    const newbie = await userWithSession("newbie@example.com", { verified: false });
    const res = await accept(newbie, token);

    expect(res.status).toBe(200);
    expect(res.body.data.organization).toEqual({ id: t.orgId, name: "Acme Studio", slug: "acme-studio", role: "ADMIN" });
    expect((await membershipOf(t.orgId, newbie.userId)).role).toBe("ADMIN");

    const invitation = await prisma.invitation.findFirstOrThrow();
    expect(invitation.acceptedById).toBe(newbie.userId);
    expect(invitation.acceptedAt).not.toBeNull();

    // The link proved they own the address.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: newbie.userId } })).emailVerifiedAt).not.toBeNull();

    // And they can now use the organization.
    expect((await newbie.as("get", `/organizations/${t.orgId}`)).status).toBe(200);
  });

  it("refuses a forwarded link used by a different account", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "intended@example.com" });
    const token = tokenFromLastEmail();
    const stranger = await userWithSession("stranger@example.com");

    const res = await accept(stranger, token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INVITATION_EMAIL_MISMATCH");
    expect(await membershipOf(t.orgId, stranger.userId)).toBeNull();
    expect((await prisma.invitation.findFirstOrThrow()).acceptedAt).toBeNull();
  });

  it("requires authentication", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "new@example.com" });

    const res = await request(app)
      .post("/api/v1/invitations/accept")
      .set("Origin", WEB_ORIGIN)
      .send({ token: tokenFromLastEmail() });

    expect(res.status).toBe(401);
  });

  it("is safe to repeat, and two simultaneous accepts create one membership", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "joiner@example.com" });
    const token = tokenFromLastEmail();
    const joiner = await userWithSession("joiner@example.com");

    const results = await Promise.all([accept(joiner, token), accept(joiner, token)]);
    const again = await accept(joiner, token);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(again.status).toBe(200);
    expect(await prisma.organizationMember.count({ where: { userId: joiner.userId } })).toBe(1);
  });

  it("keeps an existing membership's role", async () => {
    const t = await team();
    await t.invite(t.owner, { email: "joiner@example.com", role: "MEMBER" });
    const token = tokenFromLastEmail();
    const joiner = await userWithSession("joiner@example.com");
    // Added some other way in the meantime, as ADMIN.
    await prisma.organizationMember.create({ data: { organizationId: t.orgId, userId: joiner.userId, role: "ADMIN" } });

    const res = await accept(joiner, token);

    expect(res.status).toBe(200);
    expect(res.body.data.organization.role).toBe("ADMIN");
  });

  it("rejects expired, revoked and already-used links", async () => {
    const t = await team();
    const joiner = await userWithSession("joiner@example.com");
    const other = await userWithSession("other@example.com");

    await t.invite(t.owner, { email: "joiner@example.com" });
    const expiredToken = tokenFromLastEmail();
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(joiner, expiredToken)).status).toBe(410);

    const revoked = await t.invite(t.owner, { email: "joiner@example.com" });
    const revokedToken = tokenFromLastEmail();
    await t.owner.as("delete", `${t.invitations}/${revoked.body.data.invitation.id}`);
    expect((await accept(joiner, revokedToken)).status).toBe(404);

    await t.invite(t.owner, { email: "other@example.com" });
    const usedToken = tokenFromLastEmail();
    expect((await accept(other, usedToken)).status).toBe(200);
    // A used link is dead for everyone else.
    expect((await accept(joiner, usedToken)).status).toBe(404);

    expect(await membershipOf(t.orgId, joiner.userId)).toBeNull();
  });

  it("only adds you to the organization that sent the invite", async () => {
    const t = await team();
    const rival = await userWithSession("rival@example.com");
    const rivalOrg = (await rival.as("post", "/organizations").send({ name: "Rival" })).body.data.organization.id;
    await t.invite(t.owner, { email: "joiner@example.com" });
    const token = tokenFromLastEmail();
    const joiner = await userWithSession("joiner@example.com");

    await accept(joiner, token);

    expect(await membershipOf(t.orgId, joiner.userId)).not.toBeNull();
    expect(await membershipOf(rivalOrg, joiner.userId)).toBeNull();
  });
});
