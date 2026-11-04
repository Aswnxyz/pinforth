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

  // Create primary organization
  const orgRes = await owner.as("post", "/organizations").send({ name: "Acme Agency" });
  const orgId = orgRes.body.data.organization.id;

  // Create outsider organization
  const otherOrgRes = await outsider.as("post", "/organizations").send({ name: "Rival Agency" });
  const otherOrgId = otherOrgRes.body.data.organization.id;

  // Add members to primary organization
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

  // Lookup owner membership
  const ownerMember = await prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: orgId, userId: owner.userId } },
  });

  // Create primary project
  const projRes = await owner
    .as("post", `/organizations/${orgId}/projects`)
    .send({ name: "Acme Website", description: "Main agency website" });
  const project = projRes.body.data.project;

  // Create environment for primary project
  const envRes = await owner
    .as("post", `/organizations/${orgId}/projects/${project.slug}/environments`)
    .send({ name: "Staging", url: "https://staging.acme.com" });
  const environment = envRes.body.data.environment;

  // Create secondary project in other org
  const otherProjRes = await outsider
    .as("post", `/organizations/${otherOrgId}/projects`)
    .send({ name: "Rival Portal" });
  const otherProject = otherProjRes.body.data.project;

  const otherEnvRes = await outsider
    .as("post", `/organizations/${otherOrgId}/projects/${otherProject.slug}/environments`)
    .send({ name: "Rival Staging", url: "https://staging.rival.com" });
  const otherEnvironment = otherEnvRes.body.data.environment;

  const otherMember = await prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: otherOrgId, userId: outsider.userId } },
  });

  const issuesPath = `/organizations/${orgId}/projects/${project.slug}/issues`;

  return {
    owner,
    admin,
    member,
    unverified,
    outsider,
    orgId,
    otherOrgId,
    project,
    environment,
    otherProject,
    otherEnvironment,
    ownerMember,
    adminMember,
    regularMember,
    unverifiedMember,
    otherMember,
    issuesPath,
  };
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /organizations/:orgId/projects/:projectSlug/issues", () => {
  it("creates an issue with title only and applies defaults", async () => {
    const t = await setupTeam();

    const res = await t.owner.as("post", t.issuesPath).send({
      title: "Navigation dropdown broken on mobile",
    });

    expect(res.status).toBe(201);
    const { issue } = res.body.data;
    expect(issue).toMatchObject({
      number: 1,
      title: "Navigation dropdown broken on mobile",
      description: null,
      type: "BUG",
      priority: "MEDIUM",
      status: "NEW",
      source: "DASHBOARD",
      environment: null,
      assignee: null,
      reporter: {
        id: t.owner.userId,
        name: "owner",
        email: "owner@example.com",
      },
    });
    expect(issue.id).toBeDefined();
    expect(issue.createdAt).toBeDefined();
    expect(issue.updatedAt).toBeDefined();
  });

  it("creates an issue with all valid inputs", async () => {
    const t = await setupTeam();

    const res = await t.owner.as("post", t.issuesPath).send({
      title: "Button styling misalignment",
      description: "Submit button is 4px too far left on 1440px viewport.",
      type: "DESIGN",
      priority: "HIGH",
      assigneeId: t.regularMember.id,
      environmentId: t.environment.id,
    });

    expect(res.status).toBe(201);
    const { issue } = res.body.data;
    expect(issue).toMatchObject({
      number: 1,
      title: "Button styling misalignment",
      description: "Submit button is 4px too far left on 1440px viewport.",
      type: "DESIGN",
      priority: "HIGH",
      status: "NEW",
      source: "DASHBOARD",
      environment: {
        id: t.environment.id,
        name: "Staging",
        slug: "staging",
      },
      reporter: {
        id: t.owner.userId,
        name: "owner",
        email: "owner@example.com",
      },
      assignee: {
        id: t.regularMember.id,
        name: "member",
        email: "member@example.com",
      },
    });
  });

  it("assigns sequential issue numbers (1, 2, 3)", async () => {
    const t = await setupTeam();

    const res1 = await t.owner.as("post", t.issuesPath).send({ title: "Issue One" });
    const res2 = await t.owner.as("post", t.issuesPath).send({ title: "Issue Two" });
    const res3 = await t.owner.as("post", t.issuesPath).send({ title: "Issue Three" });

    expect(res1.body.data.issue.number).toBe(1);
    expect(res2.body.data.issue.number).toBe(2);
    expect(res3.body.data.issue.number).toBe(3);
  });

  it("enforces strict Zod validation: rejects forged and unsupported properties with 400", async () => {
    const t = await setupTeam();

    const res = await t.owner.as("post", t.issuesPath).send({
      title: "Legitimate Title",
      status: "CLOSED", // forged status
      source: "WIDGET", // forged source
      number: 999, // forged number
      reporterId: t.outsider.userId, // forged reporter
      pageUrl: "https://evil.com", // unsupported property
      context: { foo: "bar" }, // unsupported property
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("requires a verified email address", async () => {
    const t = await setupTeam();

    const res = await t.unverified.as("post", t.issuesPath).send({
      title: "Unverified attempt",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("rejects missing or empty title with 400", async () => {
    const t = await setupTeam();

    const res1 = await t.owner.as("post", t.issuesPath).send({});
    expect(res1.status).toBe(400);

    const res2 = await t.owner.as("post", t.issuesPath).send({ title: "   " });
    expect(res2.status).toBe(400);
  });

  it("rejects an assignee from a different organization (tenant isolation)", async () => {
    const t = await setupTeam();

    const res = await t.owner.as("post", t.issuesPath).send({
      title: "Cross-tenant assignee attempt",
      assigneeId: t.otherMember.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
    expect(res.body.message).toContain("Assignee must be a member of this organization");
  });

  it("rejects an environment from a different project (tenant isolation)", async () => {
    const t = await setupTeam();

    const res = await t.owner.as("post", t.issuesPath).send({
      title: "Cross-project environment attempt",
      environmentId: t.otherEnvironment.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
    expect(res.body.message).toContain("Environment not found in this project");
  });

  it("returns 404 for an outsider trying to create an issue", async () => {
    const t = await setupTeam();

    const res = await t.outsider.as("post", t.issuesPath).send({
      title: "Outsider attempt",
    });

    expect(res.status).toBe(404);
  });
});

describe("Concurrent Issue Creation", () => {
  it("safely generates sequential issue numbers under high concurrency without collisions", async () => {
    const t = await setupTeam();

    const count = 10;
    const promises = Array.from({ length: count }, (_, idx) =>
      t.owner.as("post", t.issuesPath).send({ title: `Concurrent Issue ${idx + 1}` })
    );

    const responses = await Promise.all(promises);

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses.map((r) => r.body.data.issue.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify database count and project counter
    const project = await prisma.project.findUnique({
      where: { id: t.project.id },
      select: { lastIssueNumber: true },
    });
    expect(project?.lastIssueNumber).toBe(10);
  });
});

describe("GET /organizations/:orgId/projects/:projectSlug/issues", () => {
  it("returns issues ordered by number descending with stable pagination", async () => {
    const t = await setupTeam();

    await t.owner.as("post", t.issuesPath).send({ title: "Issue 1" });
    await t.owner.as("post", t.issuesPath).send({ title: "Issue 2" });
    await t.owner.as("post", t.issuesPath).send({ title: "Issue 3" });

    const res = await t.member.as("get", t.issuesPath);

    expect(res.status).toBe(200);
    const { issues, pagination, counts } = res.body.data;

    expect(issues.map((i) => i.number)).toEqual([3, 2, 1]);
    expect(pagination).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
    expect(counts).toEqual({
      all: 3,
      NEW: 3,
      IN_PROGRESS: 0,
      READY_FOR_VERIFICATION: 0,
      CLOSED: 0,
    });
  });

  it("filters by assigned to me using ?assigneeId=me", async () => {
    const t = await setupTeam();

    // Create issue assigned to regularMember
    await t.owner.as("post", t.issuesPath).send({
      title: "Assigned to member",
      assigneeId: t.regularMember.id,
    });
    // Create issue assigned to owner
    await t.owner.as("post", t.issuesPath).send({
      title: "Assigned to owner",
      assigneeId: t.ownerMember.id,
    });
    // Create unassigned issue
    await t.owner.as("post", t.issuesPath).send({
      title: "Unassigned issue",
    });

    // Regular member requests ?assigneeId=me
    const memberRes = await t.member.as("get", `${t.issuesPath}?assigneeId=me`);
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.data.issues).toHaveLength(1);
    expect(memberRes.body.data.issues[0].title).toBe("Assigned to member");
    expect(memberRes.body.data.counts.all).toBe(1);

    // Owner requests ?assigneeId=me
    const ownerRes = await t.owner.as("get", `${t.issuesPath}?assigneeId=me`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.issues).toHaveLength(1);
    expect(ownerRes.body.data.issues[0].title).toBe("Assigned to owner");
    expect(ownerRes.body.data.counts.all).toBe(1);

    // Request unassigned issues
    const unassignedRes = await t.owner.as("get", `${t.issuesPath}?assigneeId=unassigned`);
    expect(unassignedRes.status).toBe(200);
    expect(unassignedRes.body.data.issues).toHaveLength(1);
    expect(unassignedRes.body.data.issues[0].title).toBe("Unassigned issue");
  });

  it("computes status counts respecting active filters (search, assignee) except the selected status", async () => {
    const t = await setupTeam();

    // Issue 1: NEW, assigned to regularMember, title "Login error"
    const res1 = await t.owner.as("post", t.issuesPath).send({
      title: "Login error",
      assigneeId: t.regularMember.id,
    });
    // Issue 2: IN_PROGRESS, assigned to regularMember, title "Login redirect loop"
    const res2 = await t.owner.as("post", t.issuesPath).send({
      title: "Login redirect loop",
      assigneeId: t.regularMember.id,
    });
    await t.owner.as("patch", `${t.issuesPath}/${res2.body.data.issue.number}`).send({
      status: "IN_PROGRESS",
    });

    // Issue 3: IN_PROGRESS, assigned to ownerMember, title "Login styling"
    const res3 = await t.owner.as("post", t.issuesPath).send({
      title: "Login styling",
      assigneeId: t.ownerMember.id,
    });
    await t.owner.as("patch", `${t.issuesPath}/${res3.body.data.issue.number}`).send({
      status: "IN_PROGRESS",
    });

    // Issue 4: CLOSED, assigned to regularMember, title "Other issue"
    const res4 = await t.owner.as("post", t.issuesPath).send({
      title: "Other issue",
      assigneeId: t.regularMember.id,
    });
    await t.owner.as("patch", `${t.issuesPath}/${res4.body.data.issue.number}`).send({
      status: "CLOSED",
    });

    // Now regular member filters: search="Login", assigneeId="me", AND clicks the "IN_PROGRESS" status tab
    const res = await t.member.as(
      "get",
      `${t.issuesPath}?search=Login&assigneeId=me&status=IN_PROGRESS`
    );

    expect(res.status).toBe(200);
    const { issues, counts, pagination } = res.body.data;

    // Only 1 issue returned in the list (Issue 2)
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe("Login redirect loop");
    expect(pagination.total).toBe(1);

    // But the status counts preserve the full breakdown for search="Login" and assigneeId="me"
    // Issue 1 (NEW, Login, member) -> NEW: 1
    // Issue 2 (IN_PROGRESS, Login, member) -> IN_PROGRESS: 1
    // Issue 3 is assigned to owner, so excluded.
    // Issue 4 doesn't match "Login", so excluded.
    expect(counts).toEqual({
      all: 2,
      NEW: 1,
      IN_PROGRESS: 1,
      READY_FOR_VERIFICATION: 0,
      CLOSED: 0,
    });
  });

  it("enforces tenant isolation: does not leak issues from other projects or organizations", async () => {
    const t = await setupTeam();

    await t.owner.as("post", t.issuesPath).send({ title: "Acme Issue" });
    await t.outsider
      .as("post", `/organizations/${t.otherOrgId}/projects/${t.otherProject.slug}/issues`)
      .send({ title: "Rival Issue" });

    const resAcme = await t.owner.as("get", t.issuesPath);
    expect(resAcme.body.data.issues).toHaveLength(1);
    expect(resAcme.body.data.issues[0].title).toBe("Acme Issue");

    const resRival = await t.outsider.as(
      "get",
      `/organizations/${t.otherOrgId}/projects/${t.otherProject.slug}/issues`
    );
    expect(resRival.body.data.issues).toHaveLength(1);
    expect(resRival.body.data.issues[0].title).toBe("Rival Issue");
  });
});

describe("GET /organizations/:orgId/projects/:projectSlug/issues/:number", () => {
  it("returns single issue detail", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({
      title: "Detailed Issue",
      description: "Full details description",
      type: "CONTENT",
      priority: "CRITICAL",
      environmentId: t.environment.id,
    });
    const issueNum = created.body.data.issue.number;

    const res = await t.member.as("get", `${t.issuesPath}/${issueNum}`);
    expect(res.status).toBe(200);
    expect(res.body.data.issue).toMatchObject({
      number: issueNum,
      title: "Detailed Issue",
      description: "Full details description",
      type: "CONTENT",
      priority: "CRITICAL",
      status: "NEW",
      environment: {
        id: t.environment.id,
        name: "Staging",
        slug: "staging",
      },
    });
  });

  it("returns 404 for non-existent issue number", async () => {
    const t = await setupTeam();

    const res = await t.member.as("get", `${t.issuesPath}/999`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 404 for invalid number param (e.g. non-numeric)", async () => {
    const t = await setupTeam();

    const res = await t.member.as("get", `${t.issuesPath}/abc`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /organizations/:orgId/projects/:projectSlug/issues/:number", () => {
  it("allows regular organization MEMBER to update an issue", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({
      title: "Initial Title",
      type: "BUG",
      priority: "LOW",
    });
    const issueNum = created.body.data.issue.number;

    const res = await t.member.as("patch", `${t.issuesPath}/${issueNum}`).send({
      title: "Updated Title by Member",
      priority: "HIGH",
      status: "IN_PROGRESS",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.issue).toMatchObject({
      number: issueNum,
      title: "Updated Title by Member",
      priority: "HIGH",
      status: "IN_PROGRESS",
    });
  });

  it("allows unassigning an issue with assigneeId: null", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({
      title: "Assigned initially",
      assigneeId: t.regularMember.id,
    });
    const issueNum = created.body.data.issue.number;
    expect(created.body.data.issue.assignee).not.toBeNull();

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({
      assigneeId: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.issue.assignee).toBeNull();
  });

  it("allows clearing description with description: null or empty string", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({
      title: "With description",
      description: "Initial description",
    });
    const issueNum = created.body.data.issue.number;

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({
      description: "",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.issue.description).toBeNull();
  });

  it("enforces strict Zod validation: rejects forged and unsupported properties with 400", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({ title: "Issue" });
    const issueNum = created.body.data.issue.number;

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({
      number: 888, // immutable / forged
      reporterId: t.outsider.userId, // immutable / forged
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty PATCH body with 400", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({ title: "Issue" });
    const issueNum = created.body.data.issue.number;

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an assignee from another organization on PATCH", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({ title: "Issue" });
    const issueNum = created.body.data.issue.number;

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({
      assigneeId: t.otherMember.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Assignee must be a member of this organization");
  });

  it("rejects an environment from another project on PATCH", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({ title: "Issue" });
    const issueNum = created.body.data.issue.number;

    const res = await t.owner.as("patch", `${t.issuesPath}/${issueNum}`).send({
      environmentId: t.otherEnvironment.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Environment not found in this project");
  });
});

describe("Automatic Assignment Clearing on Member Removal", () => {
  it("automatically nullifies assigneeId when an organization member is removed (onDelete: SetNull)", async () => {
    const t = await setupTeam();

    // Create an issue assigned to regularMember
    const created = await t.owner.as("post", t.issuesPath).send({
      title: "Assigned to departing member",
      assigneeId: t.regularMember.id,
    });
    const issueNum = created.body.data.issue.number;
    expect(created.body.data.issue.assignee?.id).toBe(t.regularMember.id);

    // Remove regularMember from the organization
    const removeRes = await t.owner
      .as("delete", `/organizations/${t.orgId}/members/${t.regularMember.id}`);
    expect(removeRes.status).toBe(200);

    // Fetch the issue: assignee must be null, but the issue and reporter remain intact
    const issueRes = await t.owner.as("get", `${t.issuesPath}/${issueNum}`);
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.issue.assignee).toBeNull();
    expect(issueRes.body.data.issue.title).toBe("Assigned to departing member");
    expect(issueRes.body.data.issue.reporter.email).toBe("owner@example.com");
  });
});

describe("DELETE /organizations/:orgId/projects/:projectSlug/issues/:number", () => {
  it("allows OWNER and ADMIN to delete an issue", async () => {
    const t = await setupTeam();

    const created1 = await t.owner.as("post", t.issuesPath).send({ title: "Delete by Owner" });
    const num1 = created1.body.data.issue.number;

    const delRes1 = await t.owner.as("delete", `${t.issuesPath}/${num1}`);
    expect(delRes1.status).toBe(200);
    expect(delRes1.body.data).toEqual({ deleted: true, number: num1 });

    const created2 = await t.owner.as("post", t.issuesPath).send({ title: "Delete by Admin" });
    const num2 = created2.body.data.issue.number;

    const delRes2 = await t.admin.as("delete", `${t.issuesPath}/${num2}`);
    expect(delRes2.status).toBe(200);
    expect(delRes2.body.data).toEqual({ deleted: true, number: num2 });
  });

  it("forbids regular organization MEMBER from deleting an issue", async () => {
    const t = await setupTeam();

    const created = await t.owner.as("post", t.issuesPath).send({ title: "Member delete attempt" });
    const issueNum = created.body.data.issue.number;

    const res = await t.member.as("delete", `${t.issuesPath}/${issueNum}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("never reuses deleted issue numbers", async () => {
    const t = await setupTeam();

    // Create issue 1, 2, 3
    const res1 = await t.owner.as("post", t.issuesPath).send({ title: "Issue 1" });
    const res2 = await t.owner.as("post", t.issuesPath).send({ title: "Issue 2" });
    const res3 = await t.owner.as("post", t.issuesPath).send({ title: "Issue 3" });

    expect(res1.body.data.issue.number).toBe(1);
    expect(res2.body.data.issue.number).toBe(2);
    expect(res3.body.data.issue.number).toBe(3);

    // Delete issue 2
    const delRes = await t.owner.as("delete", `${t.issuesPath}/2`);
    expect(delRes.status).toBe(200);

    // Verify issue 2 is gone
    const getRes2 = await t.owner.as("get", `${t.issuesPath}/2`);
    expect(getRes2.status).toBe(404);

    // Create next issue -> must be 4, NOT 2
    const res4 = await t.owner.as("post", t.issuesPath).send({ title: "Issue 4" });
    expect(res4.body.data.issue.number).toBe(4);

    // Delete issue 4 (the latest)
    await t.owner.as("delete", `${t.issuesPath}/4`);

    // Create next issue -> must be 5, NOT 4 or 2
    const res5 = await t.owner.as("post", t.issuesPath).send({ title: "Issue 5" });
    expect(res5.body.data.issue.number).toBe(5);
  });
});
