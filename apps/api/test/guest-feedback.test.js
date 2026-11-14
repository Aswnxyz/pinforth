import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { waitForPendingMail } from "../src/lib/mailer.js";
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

async function setupTestWorkspace() {
  const owner = await userWithSession("owner@acme.com");
  const admin = await userWithSession("admin@acme.com");
  const member = await userWithSession("member@acme.com");
  const rival = await userWithSession("rival@rival.com");

  // Create Primary Agency Org
  const orgRes = await owner.as("post", "/organizations").send({ name: "Acme Agency" });
  const orgId = orgRes.body.data.organization.id;

  // Add Admin and Member
  await Promise.all([
    prisma.organizationMember.create({
      data: { organizationId: orgId, userId: admin.userId, role: "ADMIN" },
    }),
    prisma.organizationMember.create({
      data: { organizationId: orgId, userId: member.userId, role: "MEMBER" },
    }),
  ]);

  // Create Primary Project
  const projRes = await owner
    .as("post", `/organizations/${orgId}/projects`)
    .send({ name: "Acme Portal", description: "Acme staging site" });
  const project = projRes.body.data.project;

  // Create Staging Environment
  const envRes = await owner
    .as("post", `/organizations/${orgId}/projects/${project.slug}/environments`)
    .send({ name: "Staging", url: "https://staging.acme.com" });
  const environment = envRes.body.data.environment;

  // Create Rival Org & Project (for cross-tenant checks)
  const rivalOrgRes = await rival.as("post", "/organizations").send({ name: "Rival Agency" });
  const rivalOrgId = rivalOrgRes.body.data.organization.id;

  const rivalProjRes = await rival
    .as("post", `/organizations/${rivalOrgId}/projects`)
    .send({ name: "Rival Portal" });
  const rivalProject = rivalProjRes.body.data.project;

  const rivalEnvRes = await rival
    .as("post", `/organizations/${rivalOrgId}/projects/${rivalProject.slug}/environments`)
    .send({ name: "Rival Staging", url: "https://staging.rival.com" });
  const rivalEnvironment = rivalEnvRes.body.data.environment;

  return {
    owner,
    admin,
    member,
    rival,
    orgId,
    project,
    environment,
    rivalOrgId,
    rivalProject,
    rivalEnvironment,
  };
}

describe("Milestone 2A — Guest Review and Widget Feedback API", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Agency API — Review Rounds and Guest Links", () => {
    it("allows OWNER and ADMIN to create review rounds and guest links", async () => {
      const { owner, admin, orgId, project, environment } = await setupTestWorkspace();

      // Owner creates a review round
      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({
          name: "Sprint 14 Client QA",
          environmentId: environment.id,
          description: "Review checkout flow and mobile navigation",
        });

      expect(roundRes.status).toBe(201);
      const round = roundRes.body.data.reviewRound;
      expect(round).toMatchObject({
        name: "Sprint 14 Client QA",
        environmentId: environment.id,
        status: "ACTIVE",
        environment: {
          id: environment.id,
          name: "Staging",
          url: "https://staging.acme.com",
        },
      });

      // Admin creates a guest access link for that round
      const linkRes = await admin
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${round.id}/guest-links`)
        .send({
          reviewerName: "Alice Client",
          reviewerEmail: "alice@client.com",
          expiresInDays: 5,
        });

      expect(linkRes.status).toBe(201);
      expect(linkRes.body.data.guestLink).toMatchObject({
        reviewRoundId: round.id,
        reviewerName: "Alice Client",
        reviewerEmail: "alice@client.com",
        revokedAt: null,
      });
      expect(linkRes.body.data.token).toMatch(/^pf_gr_/);
      expect(linkRes.body.data.invitationUrl).toBe(`http://localhost:3000/review#token=${linkRes.body.data.token}`);

      // Verify listing review rounds
      const listRes = await owner
        .as("get", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send();

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.reviewRounds).toHaveLength(1);
      expect(listRes.body.data.reviewRounds[0]).toMatchObject({
        id: round.id,
        name: "Sprint 14 Client QA",
        activeLinksCount: 1,
        issuesCount: 0,
      });
    });

    it("forbids regular MEMBER from creating review rounds or guest links", async () => {
      const { owner, member, orgId, project, environment } = await setupTestWorkspace();

      const memberRoundRes = await member
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({
          name: "Member Attempt",
          environmentId: environment.id,
        });
      expect(memberRoundRes.status).toBe(403);

      // Owner creates round
      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({
          name: "Sprint 14 QA",
          environmentId: environment.id,
        });
      const roundId = roundRes.body.data.reviewRound.id;

      // Member attempts to create guest link
      const memberLinkRes = await member
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Tester" });
      expect(memberLinkRes.status).toBe(403);
    });

    it("rejects review round with an environment from another project or org", async () => {
      const { owner, orgId, project, rivalEnvironment } = await setupTestWorkspace();

      const res = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({
          name: "Cross-Tenant Attempt",
          environmentId: rivalEnvironment.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Environment not found/i);
    });

    it("allows OWNER to revoke a guest link and invalidates active sessions", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Revocation Test", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "To Revoke" });
      const linkId = linkRes.body.data.guestLink.id;
      const guestToken = linkRes.body.data.token;

      // Exchange guest token to get handoff code
      const guestEx = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: guestToken });
      expect(guestEx.status).toBe(200);

      // Widget exchanges handoff code to get session token
      const widgetEx = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .send({ handoffCode: guestEx.body.data.handoffCode });
      expect(widgetEx.status).toBe(200);
      const sessionToken = widgetEx.body.data.sessionToken;

      // Revoke guest link
      const delRes = await owner
        .as("delete", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links/${linkId}`)
        .send();
      expect(delRes.status).toBe(200);
      expect(delRes.body.data).toEqual({ revoked: true, id: linkId });

      // Attempting to use the session token now fails with 401
      const issueRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Revoked Session Issue",
          pageUrl: "https://staging.acme.com/page",
          context: {
            viewport: { width: 1024, height: 768 },
          },
        });
      expect(issueRes.status).toBe(401);
    });

    describe("Environment guest link listing", () => {
      const envLinksPath = (orgId, projectSlug, environmentId) =>
        `/organizations/${orgId}/projects/${projectSlug}/environments/${environmentId}/guest-links`;

      const listLinks = (as, orgId, project, environmentId) =>
        as("get", envLinksPath(orgId, project.slug, environmentId)).send();

      async function createRound(owner, orgId, project, environment, name) {
        const res = await owner
          .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
          .send({ name, environmentId: environment.id });
        expect(res.status).toBe(201);
        return res.body.data.reviewRound;
      }

      async function createRoundLink(owner, orgId, project, round, body = {}) {
        const res = await owner
          .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${round.id}/guest-links`)
          .send(body);
        expect(res.status).toBe(201);
        return res.body.data;
      }

      async function revokeLink(owner, orgId, project, link) {
        return owner
          .as(
            "delete",
            `/organizations/${orgId}/projects/${project.slug}/review-rounds/${link.reviewRoundId}/guest-links/${link.id}`
          )
          .send();
      }

      async function createProject(owner, orgId, name) {
        const res = await owner.as("post", `/organizations/${orgId}/projects`).send({ name });
        expect(res.status).toBe(201);
        return res.body.data.project;
      }

      async function createEnvironment(owner, orgId, project, name, url) {
        const res = await owner
          .as("post", `/organizations/${orgId}/projects/${project.slug}/environments`)
          .send({ name, url });
        expect(res.status).toBe(201);
        return res.body.data.environment;
      }

      async function widgetSessionToken(guestToken) {
        const guestRes = await request(app)
          .post("/api/v1/guest/reviews/exchange")
          .set("Origin", WEB_ORIGIN)
          .send({ token: guestToken });
        expect(guestRes.status).toBe(200);

        const widgetRes = await request(app)
          .post("/api/v1/widget/sessions/exchange")
          .set("Origin", "https://staging.acme.com")
          .send({ handoffCode: guestRes.body.data.handoffCode });
        expect(widgetRes.status).toBe(200);
        return widgetRes.body.data.sessionToken;
      }

      async function submitWidgetIssue(sessionToken, title) {
        const res = await request(app)
          .post("/api/v1/widget/issues")
          .set("Authorization", `Bearer ${sessionToken}`)
          .set("Origin", "https://staging.acme.com")
          .send({
            title,
            pageUrl: "https://staging.acme.com/guest-listing",
            context: { viewport: { width: 1024, height: 768 } },
          });
        expect(res.status).toBe(201);
        return res.body.data.issue;
      }

      async function createGuestSession(guestLinkId, createdAt) {
        await prisma.guestSession.create({
          data: {
            guestLinkId,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt,
          },
        });
      }

      it("allows OWNER, ADMIN and MEMBER to list links and rejects unauthenticated requests", async () => {
        const { owner, admin, member, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Roles Round");
        const { guestLink } = await createRoundLink(owner, orgId, project, round, {
          reviewerName: "Alice",
        });

        for (const user of [owner, admin, member]) {
          const res = await listLinks(user.as, orgId, project, environment.id);
          expect(res.status).toBe(200);
          expect(res.body.data.guestLinks).toHaveLength(1);
          expect(res.body.data.guestLinks[0].id).toBe(guestLink.id);
        }

        const anonymous = await request(app)
          .get(`/api/v1${envLinksPath(orgId, project.slug, environment.id)}`)
          .set("Origin", WEB_ORIGIN);
        expect(anonymous.status).toBe(401);
      });

      it("returns 404 for missing and cross-tenant resources without disclosing existence", async () => {
        const workspace = await setupTestWorkspace();
        const { owner, orgId, project, environment, rivalOrgId, rivalProject, rivalEnvironment } = workspace;

        // Seed a real link so a leak would show up as a 200 rather than an empty list.
        const round = await createRound(owner, orgId, project, environment, "Tenant Round");
        await createRoundLink(owner, orgId, project, round);

        const missingOrg = await owner
          .as("get", envLinksPath(randomUUID(), project.slug, environment.id))
          .send();
        expect(missingOrg.status).toBe(404);
        expect(missingOrg.body.message).toMatch(/Organization not found/);

        const missingProject = await owner
          .as("get", envLinksPath(orgId, "missing-project", environment.id))
          .send();
        expect(missingProject.status).toBe(404);
        expect(missingProject.body.message).toMatch(/Project not found/);

        const missingEnvironment = await listLinks(owner.as, orgId, project, randomUUID());
        expect(missingEnvironment.status).toBe(404);

        const secondProject = await createProject(owner, orgId, "Second Portal");
        const secondProjectEnvironment = await createEnvironment(
          owner,
          orgId,
          secondProject,
          "Preview",
          "https://preview.acme.com"
        );
        const foreignEnvironment = await listLinks(owner.as, orgId, project, secondProjectEnvironment.id);
        expect(foreignEnvironment.status).toBe(404);

        const rivalOrgEnvironment = await listLinks(owner.as, orgId, project, rivalEnvironment.id);
        expect(rivalOrgEnvironment.status).toBe(404);

        // Missing, other-project and cross-tenant environment responses are indistinguishable.
        const missingEnvironmentBody = { status: missingEnvironment.status, body: missingEnvironment.body };
        expect({ status: foreignEnvironment.status, body: foreignEnvironment.body }).toEqual(missingEnvironmentBody);
        expect({ status: rivalOrgEnvironment.status, body: rivalOrgEnvironment.body }).toEqual(missingEnvironmentBody);

        const rivalProjectSlug = await owner
          .as("get", envLinksPath(orgId, rivalProject.slug, rivalEnvironment.id))
          .send();
        expect(rivalProjectSlug.status).toBe(404);
        expect(rivalProjectSlug.body.message).toMatch(/Project not found/);

        const rivalOrg = await owner
          .as("get", envLinksPath(rivalOrgId, rivalProject.slug, rivalEnvironment.id))
          .send();
        expect(rivalOrg.status).toBe(404);
        expect(rivalOrg.body.message).toMatch(/Organization not found/);
      });

      it("lists links from every round in the environment, excludes other environments and projects, and orders newest first", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();

        const otherEnvironment = await createEnvironment(
          owner,
          orgId,
          project,
          "Preview",
          "https://preview.acme.com"
        );
        const otherProject = await createProject(owner, orgId, "Other Portal");
        const otherProjectEnvironment = await createEnvironment(
          owner,
          orgId,
          otherProject,
          "Staging",
          "https://other.acme.com"
        );
        const emptyEnvironment = await createEnvironment(
          owner,
          orgId,
          project,
          "Empty",
          "https://empty.acme.com"
        );

        const roundOne = await createRound(owner, orgId, project, environment, "Round One");
        const roundTwo = await createRound(owner, orgId, project, environment, "Round Two");
        const otherEnvironmentRound = await createRound(
          owner,
          orgId,
          project,
          otherEnvironment,
          "Other Environment Round"
        );
        const otherProjectRound = await createRound(
          owner,
          orgId,
          otherProject,
          otherProjectEnvironment,
          "Other Project Round"
        );

        const oldest = await createRoundLink(owner, orgId, project, roundOne, { reviewerName: "Oldest" });
        const middle = await createRoundLink(owner, orgId, project, roundOne, { reviewerName: "Middle" });
        const newest = await createRoundLink(owner, orgId, project, roundTwo, { reviewerName: "Newest" });
        const otherEnvironmentLink = await createRoundLink(owner, orgId, project, otherEnvironmentRound, {
          reviewerName: "Other environment",
        });
        const otherProjectLink = await createRoundLink(owner, orgId, otherProject, otherProjectRound, {
          reviewerName: "Other project",
        });

        await prisma.guestAccessLink.update({
          where: { id: oldest.guestLink.id },
          data: { createdAt: new Date("2026-11-01T00:00:00.000Z") },
        });
        await prisma.guestAccessLink.update({
          where: { id: middle.guestLink.id },
          data: { createdAt: new Date("2026-11-02T00:00:00.000Z") },
        });
        await prisma.guestAccessLink.update({
          where: { id: newest.guestLink.id },
          data: { createdAt: new Date("2026-11-03T00:00:00.000Z") },
        });
        await prisma.guestAccessLink.update({
          where: { id: otherEnvironmentLink.guestLink.id },
          data: { createdAt: new Date("2026-11-04T00:00:00.000Z") },
        });
        await prisma.guestAccessLink.update({
          where: { id: otherProjectLink.guestLink.id },
          data: { createdAt: new Date("2026-11-05T00:00:00.000Z") },
        });

        const res = await listLinks(owner.as, orgId, project, environment.id);
        expect(res.status).toBe(200);
        expect(res.body.data.guestLinks.map((link) => link.id)).toEqual([
          newest.guestLink.id,
          middle.guestLink.id,
          oldest.guestLink.id,
        ]);
        expect(res.body.data.guestLinks.map((link) => link.reviewRoundId)).toEqual([
          roundTwo.id,
          roundOne.id,
          roundOne.id,
        ]);

        const otherEnvironmentRes = await listLinks(owner.as, orgId, project, otherEnvironment.id);
        expect(otherEnvironmentRes.body.data.guestLinks.map((link) => link.id)).toEqual([
          otherEnvironmentLink.guestLink.id,
        ]);

        const otherProjectRes = await listLinks(owner.as, orgId, otherProject, otherProjectEnvironment.id);
        expect(otherProjectRes.body.data.guestLinks.map((link) => link.id)).toEqual([
          otherProjectLink.guestLink.id,
        ]);

        const emptyRes = await listLinks(owner.as, orgId, project, emptyEnvironment.id);
        expect(emptyRes.status).toBe(200);
        expect(emptyRes.body.data.guestLinks).toEqual([]);
      });

      it("derives ACTIVE, EXPIRED and REVOKED statuses with revocation taking precedence", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Status Round");

        const active = await createRoundLink(owner, orgId, project, round, { reviewerName: "Active" });
        const expired = await createRoundLink(owner, orgId, project, round, { reviewerName: "Expired" });
        const revoked = await createRoundLink(owner, orgId, project, round, { reviewerName: "Revoked" });
        const revokedExpired = await createRoundLink(owner, orgId, project, round, {
          reviewerName: "Revoked and expired",
        });

        const past = new Date(Date.now() - 60 * 60 * 1000);
        await prisma.guestAccessLink.update({
          where: { id: expired.guestLink.id },
          data: { expiresAt: past },
        });
        await prisma.guestAccessLink.update({
          where: { id: revokedExpired.guestLink.id },
          data: { expiresAt: past },
        });

        expect((await revokeLink(owner, orgId, project, revoked.guestLink)).status).toBe(200);
        expect((await revokeLink(owner, orgId, project, revokedExpired.guestLink)).status).toBe(200);

        const res = await listLinks(owner.as, orgId, project, environment.id);
        expect(res.status).toBe(200);
        const byId = Object.fromEntries(res.body.data.guestLinks.map((link) => [link.id, link]));

        expect(byId[active.guestLink.id].status).toBe("ACTIVE");
        expect(byId[expired.guestLink.id].status).toBe("EXPIRED");
        expect(byId[revoked.guestLink.id].status).toBe("REVOKED");
        expect(byId[revokedExpired.guestLink.id].status).toBe("REVOKED");
        expect(byId[expired.guestLink.id].revokedAt).toBeNull();
        expect(byId[revokedExpired.guestLink.id].revokedAt).toEqual(expect.any(String));
      });

      it("reports the latest guest session creation time as lastOpenedAt", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Sessions Round");

        const neverOpened = await createRoundLink(owner, orgId, project, round, { reviewerName: "Never" });
        const onceOpened = await createRoundLink(owner, orgId, project, round, { reviewerName: "Once" });
        const repeatedlyOpened = await createRoundLink(owner, orgId, project, round, {
          reviewerName: "Repeated",
        });

        await createGuestSession(onceOpened.guestLink.id, new Date("2026-11-10T09:00:00.000Z"));
        await createGuestSession(repeatedlyOpened.guestLink.id, new Date("2026-11-09T09:00:00.000Z"));
        await createGuestSession(repeatedlyOpened.guestLink.id, new Date("2026-11-12T18:30:00.000Z"));
        await createGuestSession(repeatedlyOpened.guestLink.id, new Date("2026-11-11T11:00:00.000Z"));

        const res = await listLinks(owner.as, orgId, project, environment.id);
        expect(res.status).toBe(200);
        const byId = Object.fromEntries(res.body.data.guestLinks.map((link) => [link.id, link]));

        expect(byId[neverOpened.guestLink.id].lastOpenedAt).toBeNull();
        expect(byId[onceOpened.guestLink.id].lastOpenedAt).toBe("2026-11-10T09:00:00.000Z");
        expect(byId[repeatedlyOpened.guestLink.id].lastOpenedAt).toBe("2026-11-12T18:30:00.000Z");
      });

      it("counts only issues submitted through each guest link", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Issue Count Round");

        const first = await createRoundLink(owner, orgId, project, round, { reviewerName: "First" });
        const second = await createRoundLink(owner, orgId, project, round, { reviewerName: "Second" });
        const third = await createRoundLink(owner, orgId, project, round, { reviewerName: "Third" });

        const firstSession = await widgetSessionToken(first.token);
        const secondSession = await widgetSessionToken(second.token);

        await submitWidgetIssue(firstSession, "First link issue one");
        await submitWidgetIssue(firstSession, "First link issue two");
        await submitWidgetIssue(secondSession, "Second link issue one");

        const res = await listLinks(owner.as, orgId, project, environment.id);
        expect(res.status).toBe(200);
        const byId = Object.fromEntries(res.body.data.guestLinks.map((link) => [link.id, link]));

        expect(byId[first.guestLink.id].issuesCount).toBe(2);
        expect(byId[second.guestLink.id].issuesCount).toBe(1);
        expect(byId[third.guestLink.id].issuesCount).toBe(0);
      });

      it("never exposes token hashes, handoff codes, raw tokens or nested session records", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Secrecy Round");
        const created = await createRoundLink(owner, orgId, project, round, {
          reviewerName: "Secret Keeper",
          reviewerEmail: "secret@client.com",
        });
        await widgetSessionToken(created.token);

        const res = await listLinks(owner.as, orgId, project, environment.id);
        expect(res.status).toBe(200);
        expect(res.body.data.guestLinks).toHaveLength(1);

        const link = res.body.data.guestLinks[0];
        expect(Object.keys(link).sort()).toEqual([
          "createdAt",
          "expiresAt",
          "id",
          "issuesCount",
          "lastOpenedAt",
          "reviewRoundId",
          "reviewerEmail",
          "reviewerName",
          "revokedAt",
          "status",
        ]);

        const raw = JSON.stringify(res.body);
        expect(raw).not.toMatch(/tokenHash|codeHash|handoffCodes|"sessions"/);
        expect(raw).not.toMatch(/pf_gr_|pf_ws_|pf_hc_/);
        expect(raw).not.toContain(created.token);
      });

      it("keeps revocation idempotent and rejects existing sessions and new exchanges immediately", async () => {
        const { owner, orgId, project, environment } = await setupTestWorkspace();
        const round = await createRound(owner, orgId, project, environment, "Revocation Round");
        const created = await createRoundLink(owner, orgId, project, round, { reviewerName: "Revoke Me" });

        const sessionToken = await widgetSessionToken(created.token);
        await submitWidgetIssue(sessionToken, "Issue before revocation");

        // Get a valid handoff before revocation so the widget exchange is exercised afterwards.
        const handoffRes = await request(app)
          .post("/api/v1/guest/reviews/exchange")
          .set("Origin", WEB_ORIGIN)
          .send({ token: created.token });
        expect(handoffRes.status).toBe(200);
        const handoffCode = handoffRes.body.data.handoffCode;

        const firstRevoke = await revokeLink(owner, orgId, project, created.guestLink);
        expect(firstRevoke.status).toBe(200);
        expect(firstRevoke.body.data).toEqual({ revoked: true, id: created.guestLink.id });

        const secondRevoke = await revokeLink(owner, orgId, project, created.guestLink);
        expect(secondRevoke.status).toBe(200);
        expect(secondRevoke.body.data).toEqual({ revoked: true, id: created.guestLink.id });

        // An already-established widget session no longer authorizes issue submission.
        const blockedIssue = await request(app)
          .post("/api/v1/widget/issues")
          .set("Authorization", `Bearer ${sessionToken}`)
          .set("Origin", "https://staging.acme.com")
          .send({
            title: "Issue after revocation",
            pageUrl: "https://staging.acme.com/guest-listing",
            context: { viewport: { width: 1024, height: 768 } },
          });
        expect(blockedIssue.status).toBe(401);
        expect(blockedIssue.body.message).toMatch(/revoked/i);

        // New invitation exchanges reject the revoked link.
        const revokedExchange = await request(app)
          .post("/api/v1/guest/reviews/exchange")
          .set("Origin", WEB_ORIGIN)
          .send({ token: created.token });
        expect(revokedExchange.status).toBe(401);
        expect(revokedExchange.body.message).toMatch(/revoked/i);

        // A handoff issued before revocation cannot open a new widget session.
        const revokedHandoff = await request(app)
          .post("/api/v1/widget/sessions/exchange")
          .set("Origin", "https://staging.acme.com")
          .send({ handoffCode });
        expect(revokedHandoff.status).toBe(401);
        expect(revokedHandoff.body.message).toMatch(/revoked/i);

        // Sessions under the revoked link are terminated in the database as well.
        const sessions = await prisma.guestSession.findMany({
          where: { guestLinkId: created.guestLink.id },
          select: { revokedAt: true },
        });
        expect(sessions.length).toBeGreaterThan(0);
        expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
      });
    });
  });

  describe("Guest Access & Staging Handoff API", () => {
    it("exchanges valid guest token for one-time handoff code and staging URL without login", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Round 1", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Bob Reviewer", reviewerEmail: "bob@reviewer.com" });
      const guestToken = linkRes.body.data.token;

      // Anonymous call from guest landing page on WEB_ORIGIN
      const res = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: guestToken });

      expect(res.status).toBe(200);
      expect(res.body.data.handoffCode).toMatch(/^pf_hc_/);
      expect(res.body.data.targetUrl).toBe("https://staging.acme.com");
      expect(res.body.data.stagingUrl).toBe(`https://staging.acme.com#pf_handoff=${res.body.data.handoffCode}`);
      expect(res.body.data.reviewer).toEqual({ name: "Bob Reviewer", email: "bob@reviewer.com" });
    });

    it("rejects invalid, expired, or revoked guest invitation tokens", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      // Invalid token
      const invalidRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: "pf_gr_invalid_token" });
      expect(invalidRes.status).toBe(401);

      // Create a round and link
      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Round Expiry", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Expired Reviewer" });
      const linkId = linkRes.body.data.guestLink.id;
      const token = linkRes.body.data.token;

      // Manually expire link
      await prisma.guestAccessLink.update({
        where: { id: linkId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const expiredRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token });
      expect(expiredRes.status).toBe(401);
      expect(expiredRes.body.message).toMatch(/expired/i);
    });

    it("rejects guest exchange when review round is not ACTIVE", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Closed Round", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Reviewer" });
      const token = linkRes.body.data.token;

      // Close the review round
      await prisma.reviewRound.update({
        where: { id: roundId },
        data: { status: "CLOSED" },
      });

      const res = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not active/i);
    });
  });

  describe("Widget API — Exchange and Staging Origin Security", () => {
    it("handles CORS preflight for widget from staging origin", async () => {
      const preflight = await request(app)
        .options("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .set("Access-Control-Request-Method", "POST");

      expect(preflight.status).toBe(204);
      expect(preflight.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(preflight.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("exchanges handoff code for widget session token and prevents replay attacks", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Widget Round", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Carol Guest" });
      const guestToken = linkRes.body.data.token;

      // Guest portal exchanges token for handoff code
      const guestRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: guestToken });
      const handoffCode = guestRes.body.data.handoffCode;

      // Widget exchanges handoff code from allowed staging origin
      const widgetRes = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .send({ handoffCode });

      expect(widgetRes.status).toBe(200);
      expect(widgetRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(widgetRes.body.data.sessionToken).toMatch(/^pf_ws_/);
      expect(widgetRes.body.data.project.slug).toBe(project.slug);
      expect(widgetRes.body.data.environment.url).toBe("https://staging.acme.com");
      expect(widgetRes.body.data.reviewer.name).toBe("Carol Guest");

      // REPLAY ATTACK: Reusing the same handoff code must be rejected
      const replayRes = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .send({ handoffCode });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toMatch(/already used|invalid/i);
    });

    it("rejects widget exchange when origin does not match configured staging environment", async () => {
      const { owner, orgId, project, environment } = await setupTestWorkspace();

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Widget Round", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "Attacker Target" });

      const guestRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: linkRes.body.data.token });
      const handoffCode = guestRes.body.data.handoffCode;

      // Calling from disallowed origin
      const evilRes = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://malicious-site.example")
        .send({ handoffCode });

      expect(evilRes.status).toBe(403);
      expect(evilRes.body.message).toMatch(/Origin not allowed/i);
      expect(evilRes.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("ensures CORS headers and Vary: Origin are returned on error responses for authorized staging origins", async () => {
      const workspace = await setupTestWorkspace();
      const { owner, orgId, project, environment } = workspace;

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "CORS Error Round", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "CORS Tester" });

      const guestRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: linkRes.body.data.token });

      const widgetRes = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .send({ handoffCode: guestRes.body.data.handoffCode });
      const sessionToken = widgetRes.body.data.sessionToken;

      // 1. Missing Bearer token (401)
      const noAuthRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Origin", "https://staging.acme.com")
        .send({ title: "No Auth" });
      expect(noAuthRes.status).toBe(401);
      expect(noAuthRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(noAuthRes.headers["vary"]).toBe("Origin");

      // 2. Validation error (400)
      const valRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({ title: "" });
      expect(valRes.status).toBe(400);
      expect(valRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(valRes.headers["vary"]).toBe("Origin");

      // 3. Payload too large (413)
      const hugeRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Huge",
          pageUrl: "https://staging.acme.com",
          description: "x".repeat(70 * 1024),
          context: { viewport: { width: 1000, height: 800 } },
        });
      expect(hugeRes.status).toBe(413);
      expect(hugeRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(hugeRes.headers["vary"]).toBe("Origin");

      // 4. Page URL mismatch (400)
      const mismatchRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Wrong Page Origin",
          pageUrl: "https://wrong-domain.example/checkout",
          context: { viewport: { width: 1000, height: 800 } },
        });
      expect(mismatchRes.status).toBe(400);
      expect(mismatchRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
      expect(mismatchRes.headers["vary"]).toBe("Origin");

      // 5. Unauthorized origin on issue creation (403) must NOT have CORS header
      const evilIssueRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://evil.example")
        .send({
          title: "Evil Origin",
          pageUrl: "https://staging.acme.com/checkout",
          context: { viewport: { width: 1000, height: 800 } },
        });
      expect(evilIssueRes.status).toBe(403);
      expect(evilIssueRes.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Widget Issue Submission & Context Validation", () => {
    async function createActiveWidgetSession() {
      const workspace = await setupTestWorkspace();
      const { owner, orgId, project, environment } = workspace;

      const roundRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds`)
        .send({ name: "Widget Issue Round", environmentId: environment.id });
      const roundId = roundRes.body.data.reviewRound.id;

      const linkRes = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/review-rounds/${roundId}/guest-links`)
        .send({ reviewerName: "David Client", reviewerEmail: "david@client.com" });

      const guestRes = await request(app)
        .post("/api/v1/guest/reviews/exchange")
        .set("Origin", WEB_ORIGIN)
        .send({ token: linkRes.body.data.token });

      const widgetRes = await request(app)
        .post("/api/v1/widget/sessions/exchange")
        .set("Origin", "https://staging.acme.com")
        .send({ handoffCode: guestRes.body.data.handoffCode });

      return {
        ...workspace,
        roundId,
        sessionToken: widgetRes.body.data.sessionToken,
      };
    }

    it("creates an issue with source WIDGET, atomic numbering, structured context, and guest attribution", async () => {
      const { owner, sessionToken, orgId, project, environment } = await createActiveWidgetSession();

      const issuePayload = {
        title: "Navigation menu button does not trigger sidebar",
        description: "Clicking the mobile hamburger button does not open the drawer.",
        type: "BUG",
        priority: "HIGH",
        pageUrl: "https://staging.acme.com/catalog/shoes",
        context: {
          selector: "header > button.nav-toggle",
          element: {
            tagName: "BUTTON",
            id: "menu-btn",
            classList: ["nav-toggle", "mobile-only"],
            textContent: "Menu",
            xpath: "/html/body/header/button[1]",
            boundingBox: { top: 10, left: 15, width: 40, height: 40 },
          },
          viewport: { width: 375, height: 667, devicePixelRatio: 2 },
          scroll: { x: 0, y: 50 },
          browser: {
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...",
            language: "en-US",
            platform: "iPhone",
          },
          timestamp: "2026-11-05T14:40:00.000Z",
        },
      };

      const res = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(issuePayload);

      expect(res.status).toBe(201);
      expect(res.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");

      const created = res.body.data.issue;
      expect(created.number).toBe(1);
      expect(created.title).toBe(issuePayload.title);
      expect(created.source).toBe("WIDGET");
      expect(created.status).toBe("NEW");
      expect(created.reporter).toBeNull();
      expect(created.guest).toEqual({ name: "David Client", email: "david@client.com" });
      expect(created.environment.id).toBe(environment.id);
      expect(created.pageUrl).toBe("https://staging.acme.com/catalog/shoes");
      expect(created.context).toMatchObject({
        selector: "header > button.nav-toggle",
        viewport: { width: 375, height: 667 },
      });

      // Verify visibility in the existing agency Issues API
      const listRes = await owner
        .as("get", `/organizations/${orgId}/projects/${project.slug}/issues`)
        .send();

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.issues).toHaveLength(1);
      const dashboardIssue = listRes.body.data.issues[0];
      expect(dashboardIssue.number).toBe(1);
      expect(dashboardIssue.source).toBe("WIDGET");
      expect(dashboardIssue.reporter).toBeNull();
      expect(dashboardIssue.guest).toEqual({ name: "David Client", email: "david@client.com" });

      // Verify single-issue detail endpoint returns context and pageUrl
      const detailRes = await owner
        .as("get", `/organizations/${orgId}/projects/${project.slug}/issues/1`)
        .send();

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.issue.pageUrl).toBe("https://staging.acme.com/catalog/shoes");
      expect(detailRes.body.data.issue.context).toMatchObject({
        selector: "header > button.nav-toggle",
      });
    });

    it("protects against duplicate submissions using clientMutationId (idempotency)", async () => {
      const { sessionToken } = await createActiveWidgetSession();

      const payload = {
        title: "Idempotent Submission Test",
        pageUrl: "https://staging.acme.com/checkout",
        context: {
          viewport: { width: 1440, height: 900 },
        },
        clientMutationId: "mutation-uuid-12345",
      };

      // First submission
      const firstRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(payload);
      expect(firstRes.status).toBe(201);
      const firstNumber = firstRes.body.data.issue.number;

      // Second submission with same clientMutationId (e.g. rapid double-click)
      const secondRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(payload);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.issue.id).toBe(firstRes.body.data.issue.id);
      expect(secondRes.body.data.issue.number).toBe(firstNumber);
    });

    it("rejects widget issue submission from disallowed origin or invalid pageUrl", async () => {
      const { sessionToken } = await createActiveWidgetSession();

      // Disallowed origin header
      const originRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://evil.example")
        .send({
          title: "Bad Origin",
          pageUrl: "https://staging.acme.com/page",
          context: { viewport: { width: 1024, height: 768 } },
        });
      expect(originRes.status).toBe(403);

      // Page URL pointing outside environment origin
      const pageUrlRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Bad Page URL",
          pageUrl: "https://evil.example/page",
          context: { viewport: { width: 1024, height: 768 } },
        });
      expect(pageUrlRes.status).toBe(400);
      expect(pageUrlRes.body.message).toMatch(/Page URL origin must match/i);
    });

    it("rejects malformed context or oversized body (> 64KB)", async () => {
      const { sessionToken } = await createActiveWidgetSession();

      // Malformed context (missing required viewport)
      const malformedRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Missing Viewport",
          pageUrl: "https://staging.acme.com/page",
          context: {},
        });
      expect(malformedRes.status).toBe(400);
      expect(malformedRes.body.code).toBe("VALIDATION_ERROR");

      // Oversized body (> 64KB)
      const hugeData = "a".repeat(70 * 1024);
      const oversizedRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Huge Payload",
          pageUrl: "https://staging.acme.com/page",
          description: hugeData,
          context: { viewport: { width: 1024, height: 768 } },
        });
      expect(oversizedRes.status).toBe(413);
    });

    it("verifies sequential numbering works seamlessly between widget issues and dashboard issues", async () => {
      const { sessionToken, owner, orgId, project, environment } = await createActiveWidgetSession();

      // Widget creates Issue #1
      const widgetIssue1 = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Widget Issue #1",
          pageUrl: "https://staging.acme.com/p1",
          context: { viewport: { width: 1024, height: 768 } },
        });
      expect(widgetIssue1.status).toBe(201);
      expect(widgetIssue1.body.data.issue.number).toBe(1);

      // Agency creates Issue #2 from dashboard
      const dashboardIssue = await owner
        .as("post", `/organizations/${orgId}/projects/${project.slug}/issues`)
        .send({
          title: "Dashboard Issue #2",
          type: "BUG",
          priority: "HIGH",
          environmentId: environment.id,
        });
      expect(dashboardIssue.status).toBe(201);
      expect(dashboardIssue.body.data.issue.number).toBe(2);

      // Widget creates Issue #3
      const widgetIssue2 = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Widget Issue #3",
          pageUrl: "https://staging.acme.com/p3",
          context: { viewport: { width: 1024, height: 768 } },
        });
      expect(widgetIssue2.status).toBe(201);
      expect(widgetIssue2.body.data.issue.number).toBe(3);

      // Dashboard issue list shows numbers 3, 2, 1 in descending order
      const listRes = await owner
        .as("get", `/organizations/${orgId}/projects/${project.slug}/issues`)
        .send();
      expect(listRes.body.data.issues.map((i) => i.number)).toEqual([3, 2, 1]);
    });

    it("handles genuine concurrent requests with the same clientMutationId atomically", async () => {
      const { sessionToken } = await createActiveWidgetSession();

      const payload = {
        title: "Concurrent Race Test",
        description: "Testing concurrent duplicate submissions",
        pageUrl: "https://staging.acme.com/checkout",
        context: {
          viewport: { width: 1440, height: 900 },
        },
        clientMutationId: "race-mutation-uuid-999",
      };

      // Fire 3 simultaneous concurrent requests with identical mutation id
      const [res1, res2, res3] = await Promise.all([
        request(app)
          .post("/api/v1/widget/issues")
          .set("Authorization", `Bearer ${sessionToken}`)
          .set("Origin", "https://staging.acme.com")
          .send(payload),
        request(app)
          .post("/api/v1/widget/issues")
          .set("Authorization", `Bearer ${sessionToken}`)
          .set("Origin", "https://staging.acme.com")
          .send(payload),
        request(app)
          .post("/api/v1/widget/issues")
          .set("Authorization", `Bearer ${sessionToken}`)
          .set("Origin", "https://staging.acme.com")
          .send(payload),
      ]);

      // All requests should succeed with either 201 Created or 200 OK
      const statuses = [res1.status, res2.status, res3.status].sort();
      expect(statuses).toEqual([200, 200, 201]);

      // All return the exact same issue ID and number
      const createdId = res1.body.data.issue.id;
      const createdNumber = res1.body.data.issue.number;
      expect(res2.body.data.issue.id).toBe(createdId);
      expect(res3.body.data.issue.id).toBe(createdId);
      expect(res2.body.data.issue.number).toBe(createdNumber);
      expect(res3.body.data.issue.number).toBe(createdNumber);

      // Exactly ONE issue exists in the database with this mutation ID
      const count = await prisma.issue.count({
        where: { clientMutationId: "race-mutation-uuid-999" },
      });
      expect(count).toBe(1);

      // Next issue creates number + 1 without gaps or leaked issue numbers
      const nextRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          title: "Follow-up Issue",
          pageUrl: "https://staging.acme.com/checkout",
          context: { viewport: { width: 1440, height: 900 } },
        });
      expect(nextRes.status).toBe(201);
      expect(nextRes.body.data.issue.number).toBe(createdNumber + 1);
    });

    it("rejects reuse of clientMutationId with conflicting request parameters with 409 Conflict", async () => {
      const { sessionToken } = await createActiveWidgetSession();

      const originalPayload = {
        title: "Original Mutation Issue",
        description: "Initial description",
        type: "BUG",
        priority: "MEDIUM",
        pageUrl: "https://staging.acme.com/page-a",
        context: { viewport: { width: 1200, height: 800 } },
        clientMutationId: "conflict-mutation-uuid-1",
      };

      const firstRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(originalPayload);
      expect(firstRes.status).toBe(201);

      // Reusing mutation id with conflicting title
      const conflictRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send({
          ...originalPayload,
          title: "Conflicting Different Title",
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.code).toBe("CONFLICT");
      expect(conflictRes.body.message).toMatch(/Idempotency conflict/i);
      expect(conflictRes.headers["access-control-allow-origin"]).toBe("https://staging.acme.com");
    });

    it("never discloses internal organization member email addresses in widget responses", async () => {
      const { sessionToken, owner, orgId, project, member } = await createActiveWidgetSession();

      const payload = {
        title: "Disclosure Test Issue",
        pageUrl: "https://staging.acme.com/products",
        context: { viewport: { width: 1024, height: 768 } },
        clientMutationId: "disclosure-check-uuid",
      };

      // Create issue via widget
      const widgetRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(payload);
      expect(widgetRes.status).toBe(201);
      const issueNumber = widgetRes.body.data.issue.number;

      // Assign issue to an agency member in the dashboard
      const memberMembership = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, userId: member.userId },
      });

      const patchRes = await owner
        .as("patch", `/organizations/${orgId}/projects/${project.slug}/issues/${issueNumber}`)
        .send({ assigneeId: memberMembership.id });
      expect(patchRes.status).toBe(200);

      // Re-query the issue through widget idempotent submission
      const repeatWidgetRes = await request(app)
        .post("/api/v1/widget/issues")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("Origin", "https://staging.acme.com")
        .send(payload);

      expect(repeatWidgetRes.status).toBe(200);
      const returnedIssue = repeatWidgetRes.body.data.issue;

      // Assignee public name and ID are present, but email is NEVER exposed
      expect(returnedIssue.assignee).toMatchObject({
        id: memberMembership.id,
        name: expect.any(String),
      });
      expect(returnedIssue.assignee).not.toHaveProperty("email");
      expect(returnedIssue.assignee.user).toBeUndefined();

      // Reporter is null or doesn't have email
      if (returnedIssue.reporter) {
        expect(returnedIssue.reporter).not.toHaveProperty("email");
      }
    });
  });
});
