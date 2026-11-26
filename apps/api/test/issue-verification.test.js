import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, expect, it } from "vitest";
import app from "../src/app.js";
import { waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/modules/auth/tokens.js";
import { acceptInvitation } from "../src/modules/invitations/invitations.service.js";
import { createVerification } from "../src/modules/issues/issues.service.js";
import { lockOrganizationMembership, removeMember } from "../src/modules/organizations/members.service.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function session(name, verified = true) {
  const email = `${name}@example.com`;
  const signup = await request(app).post("/api/v1/auth/signup").set("Origin", WEB_ORIGIN)
    .send(credentials({ email, name })).expect(201);
  await waitForPendingMail();
  const id = signup.body.data.user.id;
  if (verified) {
    await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }
  const cookie = `pf_access=${cookieValue(signup, "pf_access")}`;
  return {
    id,
    email,
    as: (method, path) => request(app)[method](`/api/v1${path}`)
      .set("Origin", WEB_ORIGIN).set("Cookie", cookie),
  };
}

async function setup({ solo = false } = {}) {
  const owner = await session("owner");
  const reviewer = await session("reviewer");
  const org = await prisma.organization.create({
    data: { name: "Verification", slug: "verification", members: { create: { userId: owner.id, role: "OWNER" } } },
  });
  const member = solo ? null : await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: reviewer.id },
  });
  const project = await prisma.project.create({
    data: { name: "Site", slug: "site", organizationId: org.id },
  });
  const environment = await prisma.environment.create({
    data: { name: "Staging", slug: "staging", url: "https://example.com", projectId: project.id },
  });
  const deployment = await prisma.deployment.create({
    data: { label: "v2", environmentId: environment.id, createdAt: new Date("2026-01-02") },
  });
  const issues = `/organizations/${org.id}/projects/${project.slug}/issues`;
  const created = await owner.as("post", issues).send({ title: "Checkout issue" }).expect(201);
  const issue = created.body.data.issue;
  return { owner, reviewer, member, org, project, environment, deployment, issues, issue, path: `${issues}/${issue.number}` };
}

const data = (response) => response.body.data;
async function error(call, status, code) {
  expect((await call.expect(status)).body.code).toBe(code);
}
const submit = (t, key = "fix-1", deploymentId = t.deployment.id, actor = t.owner) =>
  actor.as("post", `${t.path}/fixes`).send({ deploymentId, clientMutationId: key });
const verify = (t, fix, input = {}, actor = t.reviewer) =>
  actor.as("post", `${t.path}/verifications`).send({
    fixSubmissionId: fix.id, clientMutationId: "verify-1", result: "PASS", ...input,
  });
const patch = (t, input, actor = t.owner) => actor.as("patch", t.path).send(input);
const attempts = async (t) => data(await t.owner.as("get", `${t.path}/attempts`).expect(200)).attempts;
const activities = (t) => prisma.issueActivity.findMany({ where: { issueId: t.issue.id } });

it("preserves failed and passing attempts through close, replay, and reopen", async () => {
  const t = await setup();
  for (const status of ["READY_FOR_VERIFICATION", "VERIFIED"]) {
    await error(patch(t, { status }), 409, "INVALID_TRANSITION");
  }
  const first = data(await submit(t).expect(201));
  expect(first.issue).toMatchObject({
    status: "READY_FOR_VERIFICATION", attemptCount: 1, pendingFix: { id: first.fix.id },
    environment: { id: t.environment.id }, verifiedOn: null,
  });
  await error(verify(t, first.fix, { result: "FAIL", note: "  " }), 400, "VALIDATION_ERROR");
  await error(verify(t, first.fix, {}, t.owner), 403, "SELF_VERIFICATION_NOT_ALLOWED");
  const fail = { result: "FAIL", note: "  Still broken  " };
  const failed = data(await verify(t, first.fix, fail).expect(201));
  expect(failed.verification).toMatchObject({ result: "FAIL", note: "Still broken", selfVerified: false });
  expect(failed.issue).toMatchObject({ status: "IN_PROGRESS", pendingFix: null, verifiedOn: null });
  const second = data(await submit(t, "fix-2").expect(201));
  expect(second.fix.attemptNumber).toBe(2);
  await error(verify(t, first.fix, { clientMutationId: "stale" }), 409, "FIX_NOT_CURRENT");
  await error(verify(t, second.fix), 409, "IDEMPOTENCY_KEY_REUSED");
  const passed = data(await verify(t, second.fix, { clientMutationId: "pass" }).expect(201));
  expect(passed.issue).toMatchObject({
    status: "VERIFIED", attemptCount: 2, pendingFix: null,
    verifiedOn: { verificationId: passed.verification.id, deployment: { id: t.deployment.id } },
  });
  const listed = data(await t.owner.as("get", `${t.issues}?status=VERIFIED`).expect(200));
  expect(listed.issues.map(({ id }) => id)).toEqual([t.issue.id]);
  expect(listed.counts.VERIFIED).toBe(1);
  await error(patch(t, { status: "CLOSED", closeReason: "DUPLICATE" }), 409, "INVALID_TRANSITION");
  const { issue: closed } = data(await patch(t, { status: "CLOSED" }).expect(200));
  expect(closed).toMatchObject({ closeReason: "RESOLVED", closedBy: { id: t.owner.id }, verifiedOn: passed.issue.verifiedOn });
  expect(closed.closedAt).toBeTruthy();
  const { issue: noop } = data(await patch(t, { status: "CLOSED", title: closed.title }).expect(200));
  expect(noop.updatedAt).toBe(closed.updatedAt);
  expect(data(await verify(t, first.fix, fail).expect(200)).issue.status).toBe("CLOSED");
  expect(data(await submit(t).expect(200)).fix.id).toBe(first.fix.id);
  const { issue: reopened } = data(await patch(t, { status: "IN_PROGRESS" }).expect(200));
  expect(reopened).toMatchObject({ closeReason: null, closedAt: null, closedBy: null, verifiedOn: null, attemptCount: 2 });
  expect((await attempts(t)).map((entry) => [entry.attempt, entry.verification.result])).toEqual([[2, "PASS"], [1, "FAIL"]]);
  expect(await prisma.verification.count({ where: { issueId: t.issue.id } })).toBe(2);
  expect((await activities(t)).map(({ type }) => type).sort()).toEqual([
    "FIX_SUBMITTED", "FIX_SUBMITTED", "ISSUE_CLOSED", "ISSUE_CREATED", "ISSUE_REOPENED", "VERIFICATION_FAILED", "VERIFICATION_PASSED",
  ]);
});

it("allows only the submitter to withdraw and retains the canonical timeline entry", async () => {
  const t = await setup();
  const { fix } = data(await submit(t).expect(201));
  await error(patch(t, { status: "IN_PROGRESS" }, t.reviewer), 403, "FORBIDDEN");
  const { issue } = data(await patch(t, { status: "IN_PROGRESS" }).expect(200));
  expect(issue).toMatchObject({ status: "IN_PROGRESS", pendingFix: null, attemptCount: 1 });
  const [attempt] = await attempts(t);
  expect(attempt).toMatchObject({ attempt: 1, fix: { id: fix.id, withdrawnBy: { id: t.owner.id } }, verification: null });
  expect(attempt.fix.withdrawnAt).toBeTruthy();
  expect(await prisma.fixSubmission.findUnique({ where: { id: fix.id } })).toMatchObject({
    withdrawnById: t.owner.id, withdrawnAt: new Date(attempt.fix.withdrawnAt),
  });
  await error(verify(t, fix), 409, "FIX_NOT_CURRENT");
  const { timeline } = data(await t.owner.as("get", `${t.path}/timeline`).expect(200));
  expect(timeline.find((item) => item.activityType === "FIX_WITHDRAWN")).toMatchObject({
    oldValue: { fixId: fix.id, attemptNumber: 1, deploymentId: t.deployment.id, deploymentLabel: "v2" },
    newValue: null,
  });
  expect((await activities(t)).filter(({ type }) => type === "FIX_WITHDRAWN")).toHaveLength(1);
});

it("rejects withdrawal when pending status has no actionable fix", async () => {
  const t = await setup();
  await prisma.issue.update({ where: { id: t.issue.id }, data: { status: "READY_FOR_VERIFICATION" } });
  await error(patch(t, { status: "IN_PROGRESS" }), 409, "FIX_NOT_CURRENT");
  expect((await activities(t)).map(({ type }) => type)).toEqual(["ISSUE_CREATED"]);
});

it("validates scope and deployment ordering before recording a result", async () => {
  const t = await setup();
  const outsider = await session("outsider");
  const other = await prisma.organization.create({ data: { name: "Other", slug: "other" } });
  const project = await prisma.project.create({ data: { name: "Other", slug: "other", organizationId: other.id } });
  const foreignEnv = await prisma.environment.create({
    data: { name: "Foreign", slug: "foreign", url: "https://example.com", projectId: project.id },
  });
  const foreign = await prisma.deployment.create({ data: { label: "foreign", environmentId: foreignEnv.id } });
  const foreignIssue = await prisma.issue.create({
    data: { title: "Foreign", projectId: project.id, number: 1 },
  });
  const foreignFix = await prisma.fixSubmission.create({
    data: { issueId: foreignIssue.id, deploymentId: foreign.id, clientMutationId: "foreign", attemptNumber: 1 },
  });
  await error(submit(t, "foreign", foreign.id), 404, "NOT_FOUND");
  await error(submit(t, "outsider", t.deployment.id, outsider), 404, "NOT_FOUND");
  await error(verify(t, foreignFix), 404, "NOT_FOUND");

  const { fix } = data(await submit(t).expect(201));
  await error(verify(t, { id: randomUUID() }), 404, "NOT_FOUND");
  await error(verify(t, foreignFix), 404, "NOT_FOUND");
  await error(verify(t, fix, { deploymentId: foreign.id }), 404, "NOT_FOUND");
  const prod = await prisma.environment.create({
    data: { name: "Production", slug: "production", url: "https://example.com", projectId: t.project.id },
  });
  const prodRelease = await prisma.deployment.create({ data: { label: "prod", environmentId: prod.id } });
  await error(verify(t, fix, { deploymentId: prodRelease.id }), 409, "DEPLOYMENT_ENVIRONMENT_MISMATCH");
  const [older, newer] = await Promise.all([
    prisma.deployment.create({ data: { label: "v1", environmentId: t.environment.id, createdAt: new Date("2026-01-01") } }),
    prisma.deployment.create({ data: { label: "v3", environmentId: t.environment.id, createdAt: new Date("2026-01-03") } }),
  ]);
  await error(verify(t, fix, { deploymentId: older.id }), 409, "DEPLOYMENT_NOT_NEWER");
  const passed = data(await verify(t, fix, { deploymentId: newer.id }).expect(201));
  expect(passed.verification.deployment.id).toBe(newer.id);
  await error(verify(t, foreignFix), 404, "NOT_FOUND");
  await error(verify(t, fix), 409, "IDEMPOTENCY_KEY_REUSED");
  await error(verify(t, fix, { clientMutationId: "different" }), 409, "FIX_NOT_CURRENT");
});

it("enforces close reasons, environment locking, and retention", async () => {
  const t = await setup();
  await error(patch(t, { status: "CLOSED" }), 400, "VALIDATION_ERROR");
  await error(patch(t, { status: "CLOSED", closeReason: "OTHER", closeNote: " " }), 400, "VALIDATION_ERROR");
  await error(patch(t, { status: "CLOSED", closeReason: "RESOLVED" }), 409, "INVALID_TRANSITION");
  await submit(t).expect(201);
  await error(patch(t, { environmentId: null }), 409, "ENVIRONMENT_LOCKED");
  await patch(t, { environmentId: t.environment.id }).expect(200);
  await error(t.owner.as("delete", t.path), 409, "ISSUE_HAS_VERIFICATION_HISTORY");
  const { issue } = data(await patch(t, { status: "CLOSED", closeReason: "OTHER", closeNote: "  Manual  " }).expect(200));
  expect(issue).toMatchObject({ status: "CLOSED", closeNote: "Manual", pendingFix: null, verifiedOn: null });
  expect(await prisma.issue.findUnique({ where: { id: t.issue.id } })).toMatchObject({ closeReason: "OTHER" });
  await patch(t, { status: "IN_PROGRESS" }).expect(200);
  expect(await attempts(t)).toHaveLength(1);
});

async function invite(t) {
  const token = randomUUID();
  await prisma.invitation.create({
    data: { tokenHash: hashToken(token), organizationId: t.org.id, email: t.reviewer.email,
      role: "MEMBER", invitedById: t.owner.id, expiresAt: new Date(Date.now() + 60_000) },
  });
  return token;
}

it("allows solo self-verification with pending invitations and retains that flag after acceptance", async () => {
  const t = await setup({ solo: true });
  const token = await invite(t);
  const { fix } = data(await submit(t).expect(201));
  const first = data(await verify(t, fix, {}, t.owner).expect(201));
  expect(first.verification.selfVerified).toBe(true);
  await acceptInvitation(t.reviewer.id, token);
  expect(data(await verify(t, fix, {}, t.owner).expect(200)).verification.selfVerified).toBe(true);
});

it("serializes acceptance with self-verification and authorizes against the current membership", async () => {
  const t = await setup({ solo: true });
  const token = await invite(t);
  const { fix } = data(await submit(t).expect(201));
  const [acceptance, result] = await Promise.all([
    acceptInvitation(t.reviewer.id, token),
    verify(t, fix, {}, t.owner),
  ]);
  expect(acceptance.organization.role).toBe("MEMBER");
  expect([201, 403]).toContain(result.status);
  if (result.status === 403) expect(result.body.code).toBe("SELF_VERIFICATION_NOT_ALLOWED");
  else expect(data(result).verification.selfVerified).toBe(true);
  const member = await prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: t.org.id, userId: t.reviewer.id } },
  });
  let release;
  let signalLocked;
  const locked = new Promise((resolve) => { signalLocked = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const removal = prisma.$transaction(async (tx) => {
    await lockOrganizationMembership(tx, t.org.id);
    await tx.organizationMember.delete({ where: { id: member.id } });
    signalLocked();
    await gate;
  });
  await locked;
  // A direct service call represents a request that already passed middleware.
  const staleRequest = createVerification(t.org.id, t.project.id, t.issue.number, t.reviewer.id, {
    fixSubmissionId: fix.id, result: "PASS", clientMutationId: "removed",
  });
  const rejected = expect(staleRequest).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  release();
  await removal;
  await rejected;
  await error(verify(t, fix, {}, t.reviewer), 404, "NOT_FOUND");
});

it("requires verified email for write endpoints and handles removal through the membership service", async () => {
  const t = await setup();
  const user = await session("unverified", false);
  const member = await prisma.organizationMember.create({ data: { organizationId: t.org.id, userId: user.id } });
  await error(submit(t, "unverified", t.deployment.id, user), 403, "EMAIL_NOT_VERIFIED");
  const { fix } = data(await submit(t).expect(201));
  await error(verify(t, fix, {}, user), 403, "EMAIL_NOT_VERIFIED");
  await removeMember(t.org.id, member.id, t.owner.id);
  await error(verify(t, fix, {}, user), 404, "NOT_FOUND");
});

it("serializes duplicate and competing submissions and verifications", async () => {
  const t = await setup();
  const duplicateFix = await Promise.all([submit(t), submit(t)]);
  expect(duplicateFix.map(({ status }) => status).sort()).toEqual([200, 201]);
  const { fix } = data(duplicateFix[0]);
  expect(data(duplicateFix[1]).fix.id).toBe(fix.id);
  await error(t.owner.as("post", `${t.path}/fixes`).send({
    deploymentId: t.deployment.id, note: "different", clientMutationId: "fix-1",
  }), 409, "IDEMPOTENCY_KEY_REUSED");
  const duplicateVerification = await Promise.all([verify(t, fix), verify(t, fix)]);
  expect(duplicateVerification.map(({ status }) => status).sort()).toEqual([200, 201]);
  expect(data(duplicateVerification[0]).verification.id).toBe(data(duplicateVerification[1]).verification.id);
  await patch(t, { status: "IN_PROGRESS" }).expect(200);
  const competing = await Promise.all([submit(t, "fix-2"), submit(t, "fix-3")]);
  expect(competing.map(({ status }) => status).sort()).toEqual([201, 409]);
  expect(competing.find(({ status }) => status === 409).body.code).toBe("FIX_ALREADY_PENDING");
  const next = data(competing.find(({ status }) => status === 201)).fix;
  const competingChecks = await Promise.all([
    verify(t, next, { clientMutationId: "check-2" }),
    verify(t, next, { clientMutationId: "check-3", result: "FAIL", note: "failed" }),
  ]);
  expect(competingChecks.map(({ status }) => status).sort()).toEqual([201, 409]);
  expect(competingChecks.find(({ status }) => status === 409).body.code).toBe("FIX_NOT_CURRENT");
  expect((await attempts(t)).map(({ attempt }) => attempt)).toEqual([2, 1]);
  expect(await prisma.verification.count({ where: { issueId: t.issue.id } })).toBe(2);
  expect((await activities(t)).filter(({ type }) => type === "FIX_SUBMITTED")).toHaveLength(2);
  expect((await activities(t)).filter(({ type }) => type.startsWith("VERIFICATION_"))).toHaveLength(2);
});

it.each([
  ["withdrawal", { status: "IN_PROGRESS" }],
  ["closure", { status: "CLOSED", closeReason: "NOT_A_BUG" }],
])("serializes verification racing %s", async (action, mutation) => {
  const t = await setup();
  const { fix } = data(await submit(t).expect(201));
  // FAIL moves to IN_PROGRESS, so a later withdrawal PATCH is a no-op.
  const [check, edit] = await Promise.all([
    verify(t, fix, { result: "FAIL", note: "still failing" }), patch(t, mutation),
  ]);
  expect(edit.status).toBe(200);
  expect([201, 409]).toContain(check.status);
  if (check.status === 409) expect(check.body.code).toBe("FIX_NOT_CURRENT");
  const [attempt] = await attempts(t);
  expect(Boolean(attempt.verification)).toBe(check.status === 201);
  expect(Boolean(attempt.fix.withdrawnAt)).toBe(action === "withdrawal" && check.status === 409);
  expect(await prisma.issue.findUnique({ where: { id: t.issue.id } })).toMatchObject({ status: mutation.status });
});
