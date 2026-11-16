import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
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

  const [adminMember, regularMember, unverifiedMember] = await Promise.all([
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

  const ownerMember = await prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: orgId, userId: owner.userId } },
  });

  const projRes = await owner
    .as("post", `/organizations/${orgId}/projects`)
    .send({ name: "Acme Website", description: "Main agency website" });
  const project = projRes.body.data.project;

  const otherProjRes = await outsider
    .as("post", `/organizations/${otherOrgId}/projects`)
    .send({ name: "Rival Portal" });
  const otherProject = otherProjRes.body.data.project;

  const issuesPath = `/organizations/${orgId}/projects/${project.slug}/issues`;
  const otherIssuesPath = `/organizations/${otherOrgId}/projects/${otherProject.slug}/issues`;

  return {
    owner,
    admin,
    member,
    unverified,
    outsider,
    orgId,
    otherOrgId,
    project,
    otherProject,
    ownerMember,
    adminMember,
    regularMember,
    unverifiedMember,
    issuesPath,
    otherIssuesPath,
  };
}

async function createIssue(as, issuesPath, extra = {}) {
  const res = await as("post", issuesPath).send({ title: "Login button broken", ...extra });
  return res.body.data.issue;
}

async function createComment(as, issuesPath, number, body = "A comment", visibility) {
  const res = await as("post", `${issuesPath}/${number}/comments`).send({
    body,
    ...(visibility ? { visibility } : {}),
  });
  return res;
}

async function getTimeline(as, issuesPath, number, query = "") {
  return as("get", `${issuesPath}/${number}/timeline${query}`);
}

const FAIL_TRIGGER = "test_fail_activity";

async function installFailingActivityTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_activity() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced activity failure';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${FAIL_TRIGGER} BEFORE INSERT ON "IssueActivity"
    FOR EACH ROW EXECUTE FUNCTION test_fail_activity();
  `);
}

async function dropFailingActivityTrigger() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${FAIL_TRIGGER} ON "IssueActivity"`
  );
}

beforeEach(resetDatabase);

afterEach(dropFailingActivityTrigger);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Issue activity recording", () => {
  it("creates an ISSUE_CREATED activity in the same transaction as the issue", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const activities = await prisma.issueActivity.findMany({
      where: { issueId: issue.id },
      include: { actor: { select: { id: true } } },
    });

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "ISSUE_CREATED",
      actorId: t.owner.userId,
      oldValue: null,
      newValue: null,
    });
    expect(activities[0].actor?.id).toBe(t.owner.userId);
  });

  it("creates one activity row per tracked field that actually changed", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    await t.owner.as("patch", `${t.issuesPath}/${issue.number}`).send({
      status: "IN_PROGRESS",
      priority: "HIGH",
      type: "DESIGN",
      title: "Login button broken on Safari",
    });

    const activities = await prisma.issueActivity.findMany({
      where: { issueId: issue.id, type: { not: "ISSUE_CREATED" } },
      orderBy: { createdAt: "asc" },
    });

    const byType = Object.fromEntries(activities.map((a) => [a.type, a]));
    expect(Object.keys(byType).sort()).toEqual(
      ["PRIORITY_CHANGED", "STATUS_CHANGED", "TITLE_CHANGED", "TYPE_CHANGED"].sort()
    );
    expect(byType.STATUS_CHANGED).toMatchObject({ oldValue: "NEW", newValue: "IN_PROGRESS" });
    expect(byType.PRIORITY_CHANGED).toMatchObject({ oldValue: "MEDIUM", newValue: "HIGH" });
    expect(byType.TYPE_CHANGED).toMatchObject({ oldValue: "BUG", newValue: "DESIGN" });
    expect(byType.TITLE_CHANGED).toMatchObject({
      oldValue: "Login button broken",
      newValue: "Login button broken on Safari",
    });
  });

  it("creates no activity when a submitted value is unchanged", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const res = await t.owner.as("patch", `${t.issuesPath}/${issue.number}`).send({
      status: "NEW",
      priority: "MEDIUM",
      title: "Login button broken",
    });
    expect(res.status).toBe(200);

    const activities = await prisma.issueActivity.findMany({ where: { issueId: issue.id } });
    expect(activities.map((a) => a.type)).toEqual(["ISSUE_CREATED"]);
  });

  it("records assignee changes with snapshotted member identity, including nulls", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}`)
      .send({ assigneeId: t.regularMember.id });
    await t.owner.as("patch", `${t.issuesPath}/${issue.number}`).send({ assigneeId: null });
    await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}`)
      .send({ assigneeId: t.adminMember.id });

    const activities = await prisma.issueActivity.findMany({
      where: { issueId: issue.id, type: "ASSIGNEE_CHANGED" },
      orderBy: { createdAt: "asc" },
    });

    expect(activities).toHaveLength(3);
    expect(activities[0].oldValue).toBeNull();
    expect(activities[0].newValue).toMatchObject({ id: t.regularMember.id, name: "member" });
    expect(activities[1].oldValue).toMatchObject({ id: t.regularMember.id, name: "member" });
    expect(activities[1].newValue).toBeNull();
    expect(activities[2].oldValue).toBeNull();
    expect(activities[2].newValue).toMatchObject({ id: t.adminMember.id, name: "admin" });
  });

  it("records description changes without storing full text", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}`)
      .send({ description: "New detailed description" });

    const activity = await prisma.issueActivity.findFirst({
      where: { issueId: issue.id, type: "DESCRIPTION_CHANGED" },
    });
    expect(activity).toMatchObject({ oldValue: null, newValue: null });
  });

  it("rolls back the issue update when activity insertion fails", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    await installFailingActivityTrigger();

    const res = await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}`)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(500);

    await dropFailingActivityTrigger();

    const stored = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { status: true },
    });
    expect(stored.status).toBe("NEW");

    const activityCount = await prisma.issueActivity.count({ where: { issueId: issue.id } });
    expect(activityCount).toBe(1);
  });

  it("rolls back issue creation and the issue-number increment when activity insertion fails", async () => {
    const t = await setupTeam();

    await installFailingActivityTrigger();

    const res = await t.owner.as("post", t.issuesPath).send({ title: "Will roll back" });
    expect(res.status).toBe(500);

    await dropFailingActivityTrigger();

    const issueCount = await prisma.issue.count({ where: { projectId: t.project.id } });
    expect(issueCount).toBe(0);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: t.project.id },
      select: { lastIssueNumber: true },
    });
    expect(project.lastIssueNumber).toBe(0);
  });
});

describe("POST issue comments", () => {
  it("creates a PUBLIC comment attributed to the authenticated member", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const res = await createComment(
      t.member.as,
      t.issuesPath,
      issue.number,
      "  The login button is not working on Safari.  ",
      "PUBLIC"
    );

    expect(res.status).toBe(201);
    expect(res.body.data.comment).toMatchObject({
      issueId: issue.id,
      author: { id: t.member.userId, name: "member" },
      body: "The login button is not working on Safari.",
      visibility: "PUBLIC",
      editedAt: null,
      deletedAt: null,
    });
    expect(res.body.data.comment.id).toBeDefined();
    expect(res.body.data.comment.createdAt).toBeDefined();
  });

  it("creates an INTERNAL comment and defaults visibility to PUBLIC", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const internal = await createComment(t.owner.as, t.issuesPath, issue.number, "Internal note", "INTERNAL");
    expect(internal.status).toBe(201);
    expect(internal.body.data.comment.visibility).toBe("INTERNAL");

    const defaulted = await createComment(t.owner.as, t.issuesPath, issue.number, "Default note");
    expect(defaulted.status).toBe(201);
    expect(defaulted.body.data.comment.visibility).toBe("PUBLIC");

    const stored = await prisma.issueComment.findUniqueOrThrow({
      where: { id: internal.body.data.comment.id },
      select: { visibility: true },
    });
    expect(stored.visibility).toBe("INTERNAL");
  });

  it("rejects invalid visibility and unknown or forged fields", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const badVisibility = await createComment(
      t.owner.as,
      t.issuesPath,
      issue.number,
      "Hello",
      "SECRET"
    );
    expect(badVisibility.status).toBe(400);
    expect(badVisibility.body.code).toBe("VALIDATION_ERROR");

    const forgedAuthor = await t.owner
      .as("post", `${t.issuesPath}/${issue.number}/comments`)
      .send({ body: "Hello", authorId: t.outsider.userId });
    expect(forgedAuthor.status).toBe(400);
  });

  it("rejects empty, whitespace-only, and over-length bodies", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const path = `${t.issuesPath}/${issue.number}/comments`;

    for (const body of ["", "   ", "x".repeat(10001)]) {
      const res = await t.owner.as("post", path).send({ body });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }

    const atLimit = await t.owner.as("post", path).send({ body: "x".repeat(10000) });
    expect(atLimit.status).toBe(201);
    expect(atLimit.body.data.comment.body).toHaveLength(10000);
  });

  it("requires a verified email and organization membership", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    const unverified = await createComment(t.unverified.as, t.issuesPath, issue.number, "Nope");
    expect(unverified.status).toBe(403);
    expect(unverified.body.code).toBe("EMAIL_NOT_VERIFIED");

    const outsider = await createComment(t.outsider.as, t.issuesPath, issue.number, "Nope");
    expect(outsider.status).toBe(404);
  });

  it("returns 404 for a missing issue", async () => {
    const t = await setupTeam();
    const res = await createComment(t.owner.as, t.issuesPath, 999, "Nope");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("PATCH issue comments", () => {
  it("lets the author edit their comment and sets editedAt without changing createdAt", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.member.as, t.issuesPath, issue.number, "Original body");

    const res = await t.member
      .as("patch", `${t.issuesPath}/${issue.number}/comments/${created.body.data.comment.id}`)
      .send({ body: "Edited body" });

    expect(res.status).toBe(200);
    expect(res.body.data.comment.body).toBe("Edited body");
    expect(res.body.data.comment.createdAt).toBe(created.body.data.comment.createdAt);
    expect(res.body.data.comment.editedAt).not.toBeNull();
  });

  it("forbids another member from editing someone else's comment", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.member.as, t.issuesPath, issue.number, "Mine");

    const res = await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}/comments/${created.body.data.comment.id}`)
      .send({ body: "Hijack" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toContain("Mine");
  });

  it("rejects invalid edits and changes to immutable fields", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.owner.as, t.issuesPath, issue.number, "Original");
    const path = `${t.issuesPath}/${issue.number}/comments/${created.body.data.comment.id}`;

    for (const payload of [{ body: "   " }, { body: "x".repeat(10001) }, { body: "ok", visibility: "INTERNAL" }, { body: "ok", deletedAt: new Date().toISOString() }]) {
      const res = await t.owner.as("patch", path).send(payload);
      expect(res.status).toBe(400);
    }
  });

  it("does not allow editing a soft-deleted comment, and a deleted comment cannot leak its body", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.owner.as, t.issuesPath, issue.number, "Delete me");
    const commentId = created.body.data.comment.id;

    await t.owner.as("delete", `${t.issuesPath}/${issue.number}/comments/${commentId}`);

    const res = await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}/comments/${commentId}`)
      .send({ body: "Too late" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");

    const timeline = await getTimeline(t.owner.as, t.issuesPath, issue.number);
    const entry = timeline.body.data.timeline.find((e) => e.id === commentId);
    expect(entry).toMatchObject({ type: "COMMENT", body: null });
    expect(entry.deletedAt).not.toBeNull();
    expect(JSON.stringify(timeline.body)).not.toContain("Delete me");
  });
});

describe("DELETE issue comments", () => {
  it("soft-deletes the author's own comment and keeps the row and body in the database", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.member.as, t.issuesPath, issue.number, "Soft delete me");
    const commentId = created.body.data.comment.id;

    const res = await t.member.as("delete", `${t.issuesPath}/${issue.number}/comments/${commentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, commentId });

    const stored = await prisma.issueComment.findUniqueOrThrow({ where: { id: commentId } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.body).toBe("Soft delete me");
  });

  it("lets OWNER and ADMIN delete another member's comment but not a regular MEMBER", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const path = (commentId) => `${t.issuesPath}/${issue.number}/comments/${commentId}`;

    const ownerTarget = await createComment(t.member.as, t.issuesPath, issue.number, "Owner deletes");
    const ownerRes = await t.owner.as("delete", path(ownerTarget.body.data.comment.id));
    expect(ownerRes.status).toBe(200);

    const adminTarget = await createComment(t.member.as, t.issuesPath, issue.number, "Admin deletes");
    const adminRes = await t.admin.as("delete", path(adminTarget.body.data.comment.id));
    expect(adminRes.status).toBe(200);

    const memberTarget = await createComment(t.owner.as, t.issuesPath, issue.number, "Member cannot");
    const memberRes = await t.member.as("delete", path(memberTarget.body.data.comment.id));
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.code).toBe("FORBIDDEN");

    const stored = await prisma.issueComment.findUniqueOrThrow({
      where: { id: memberTarget.body.data.comment.id },
    });
    expect(stored.deletedAt).toBeNull();
  });

  it("treats repeated deletion as a safe no-op", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    const created = await createComment(t.owner.as, t.issuesPath, issue.number, "Twice");
    const commentId = created.body.data.comment.id;
    const path = `${t.issuesPath}/${issue.number}/comments/${commentId}`;

    expect((await t.owner.as("delete", path)).status).toBe(200);
    const first = await prisma.issueComment.findUniqueOrThrow({ where: { id: commentId } });

    expect((await t.owner.as("delete", path)).status).toBe(200);
    const second = await prisma.issueComment.findUniqueOrThrow({ where: { id: commentId } });

    expect(second.deletedAt.toISOString()).toBe(first.deletedAt.toISOString());
  });
});

describe("GET issue timeline", () => {
  it("merges comments and activity oldest-first with discriminated types", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    await createComment(t.owner.as, t.issuesPath, issue.number, "First comment");
    await t.owner
      .as("patch", `${t.issuesPath}/${issue.number}`)
      .send({ status: "IN_PROGRESS" });
    await createComment(t.member.as, t.issuesPath, issue.number, "Second comment", "INTERNAL");

    const res = await getTimeline(t.member.as, t.issuesPath, issue.number);

    expect(res.status).toBe(200);
    const { timeline, pagination } = res.body.data;
    expect(timeline.map((e) => e.type)).toEqual(["ACTIVITY", "COMMENT", "ACTIVITY", "COMMENT"]);
    expect(timeline[0]).toMatchObject({
      type: "ACTIVITY",
      activityType: "ISSUE_CREATED",
      actor: { id: t.owner.userId, name: "owner" },
    });
    expect(timeline[2]).toMatchObject({
      type: "ACTIVITY",
      activityType: "STATUS_CHANGED",
      oldValue: "NEW",
      newValue: "IN_PROGRESS",
      actor: { id: t.owner.userId, name: "owner" },
    });
    expect(timeline[3]).toMatchObject({
      type: "COMMENT",
      body: "Second comment",
      visibility: "INTERNAL",
      author: { id: t.member.userId, name: "member" },
    });
    expect(pagination).toEqual({ limit: 20, nextCursor: null, hasMore: false });

    const timestamps = timeline.map((e) => Date.parse(e.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("returns an empty timeline when the issue has no comments or activity", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    await prisma.issueActivity.deleteMany({ where: { issueId: issue.id } });

    const res = await getTimeline(t.owner.as, t.issuesPath, issue.number);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      timeline: [],
      pagination: { limit: 20, nextCursor: null, hasMore: false },
    });
  });

  it("paginates with a cursor without duplicates or gaps across pages", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    for (let i = 1; i <= 7; i += 1) {
      await createComment(t.owner.as, t.issuesPath, issue.number, `Comment ${i}`);
    }

    const full = await getTimeline(t.owner.as, t.issuesPath, issue.number, "?limit=100");
    const expectedIds = full.body.data.timeline.map((e) => e.id);
    expect(expectedIds).toHaveLength(8);

    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const query = `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await getTimeline(t.owner.as, t.issuesPath, issue.number, query);
      expect(res.status).toBe(200);
      expect(res.body.data.timeline.length).toBeLessThanOrEqual(3);
      seen.push(...res.body.data.timeline.map((e) => e.id));
      cursor = res.body.data.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("orders deterministically when timestamps are identical", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    await prisma.issueActivity.deleteMany({ where: { issueId: issue.id } });

    const sameTime = new Date("2026-11-16T10:00:00.000Z");
    const created = [];
    for (let i = 0; i < 4; i += 1) {
      created.push(
        await prisma.issueComment.create({
          data: {
            issueId: issue.id,
            authorId: t.owner.userId,
            body: `Same time ${i}`,
            createdAt: sameTime,
          },
        })
      );
    }

    const res = await getTimeline(t.owner.as, t.issuesPath, issue.number);
    const ids = res.body.data.timeline.map((e) => e.id);
    expect(ids).toEqual([...created.map((c) => c.id)].sort());

    // A cursor exactly on this timestamp must not repeat or skip entries.
    const firstPage = await getTimeline(t.owner.as, t.issuesPath, issue.number, "?limit=2");
    const secondPage = await getTimeline(
      t.owner.as,
      t.issuesPath,
      issue.number,
      `?limit=2&cursor=${encodeURIComponent(firstPage.body.data.pagination.nextCursor)}`
    );
    expect([...firstPage.body.data.timeline, ...secondPage.body.data.timeline].map((e) => e.id)).toEqual(ids);
  });

  it("validates limit and cursor", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    expect((await getTimeline(t.owner.as, t.issuesPath, issue.number, "?limit=0")).status).toBe(400);
    expect((await getTimeline(t.owner.as, t.issuesPath, issue.number, "?limit=101")).status).toBe(400);

    const badCursor = await getTimeline(t.owner.as, t.issuesPath, issue.number, "?cursor=not-a-cursor");
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe("BAD_REQUEST");
  });

  it("returns 404 for missing issues and outsiders", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);

    expect((await getTimeline(t.owner.as, t.issuesPath, 999)).status).toBe(404);
    expect((await getTimeline(t.outsider.as, t.issuesPath, issue.number)).status).toBe(404);
  });
});

describe("Issue list commentsCount", () => {
  it("counts non-deleted comments, including INTERNAL, and updates after soft delete", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.member.as, t.issuesPath);

    const initial = await t.member.as("get", t.issuesPath);
    expect(initial.body.data.issues[0].commentsCount).toBe(0);

    await createComment(t.owner.as, t.issuesPath, issue.number, "Public note");
    await createComment(t.owner.as, t.issuesPath, issue.number, "Internal note", "INTERNAL");
    const doomed = await createComment(t.owner.as, t.issuesPath, issue.number, "Deleted note");

    const withComments = await t.member.as("get", t.issuesPath);
    expect(withComments.body.data.issues[0].commentsCount).toBe(3);

    await t.owner.as(
      "delete",
      `${t.issuesPath}/${issue.number}/comments/${doomed.body.data.comment.id}`
    );

    const afterDelete = await t.member.as("get", t.issuesPath);
    expect(afterDelete.body.data.issues[0].commentsCount).toBe(2);

    const detail = await t.member.as("get", `${t.issuesPath}/${issue.number}`);
    expect(detail.body.data.issue.commentsCount).toBe(2);
  });

  it("never exposes comment bodies through issue list or detail responses", async () => {
    const t = await setupTeam();
    const issue = await createIssue(t.owner.as, t.issuesPath);
    await createComment(t.owner.as, t.issuesPath, issue.number, "SECRET INTERNAL TEXT", "INTERNAL");

    const list = await t.member.as("get", t.issuesPath);
    const detail = await t.member.as("get", `${t.issuesPath}/${issue.number}`);

    expect(JSON.stringify(list.body)).not.toContain("SECRET INTERNAL TEXT");
    expect(JSON.stringify(detail.body)).not.toContain("SECRET INTERNAL TEXT");
    expect(list.body.data.issues[0].commentsCount).toBe(1);
  });
});

describe("Tenant isolation for comments", () => {
  it("returns 404 for a comment ID belonging to another organization", async () => {
    const t = await setupTeam();

    const acmeIssue = await createIssue(t.owner.as, t.issuesPath);
    const rivalIssue = await createIssue(t.outsider.as, t.otherIssuesPath);
    const rivalComment = await createComment(
      t.outsider.as,
      t.otherIssuesPath,
      rivalIssue.number,
      "Rival only"
    );
    const rivalCommentId = rivalComment.body.data.comment.id;

    const patch = await t.owner
      .as("patch", `${t.issuesPath}/${acmeIssue.number}/comments/${rivalCommentId}`)
      .send({ body: "Cross tenant" });
    expect(patch.status).toBe(404);

    const remove = await t.owner.as(
      "delete",
      `${t.issuesPath}/${acmeIssue.number}/comments/${rivalCommentId}`
    );
    expect(remove.status).toBe(404);

    const outsiderPatch = await t.outsider
      .as("patch", `${t.issuesPath}/${acmeIssue.number}/comments/${rivalCommentId}`)
      .send({ body: "Cross tenant" });
    expect(outsiderPatch.status).toBe(404);

    const stored = await prisma.issueComment.findUniqueOrThrow({
      where: { id: rivalCommentId },
      select: { body: true, deletedAt: true },
    });
    expect(stored).toEqual({ body: "Rival only", deletedAt: null });
  });

  it("returns 404 when using another organization's project path", async () => {
    const t = await setupTeam();
    const rivalIssue = await createIssue(t.outsider.as, t.otherIssuesPath);

    const res = await t.owner.as("get", `${t.otherIssuesPath}/${rivalIssue.number}/timeline`);
    expect(res.status).toBe(404);
  });
});
