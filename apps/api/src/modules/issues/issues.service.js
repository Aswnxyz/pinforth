import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { lockOrganizationMembership } from "../organizations/members.service.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
};

const memberSelect = {
  id: true,
  user: { select: userSelect },
};

const environmentSelect = {
  id: true,
  name: true,
  slug: true,
};

const personSelect = {
  id: true,
  name: true,
};

const deploymentSummarySelect = {
  id: true,
  label: true,
  environmentId: true,
  createdAt: true,
};

const issueSelectSummary = {
  id: true,
  number: true,
  title: true,
  type: true,
  priority: true,
  status: true,
  source: true,
  closeReason: true,
  guestName: true,
  guestEmail: true,
  createdAt: true,
  updatedAt: true,
  environment: { select: environmentSelect },
  reporter: { select: userSelect },
  assignee: { select: memberSelect },
  reviewRound: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: { select: { comments: { where: { deletedAt: null } } } },
};

const fixSelect = {
  id: true,
  issueId: true,
  attemptNumber: true,
  note: true,
  clientMutationId: true,
  createdAt: true,
  withdrawnAt: true,
  deployment: { select: deploymentSummarySelect },
  submittedBy: { select: personSelect },
  withdrawnBy: { select: personSelect },
};

const verificationSelect = {
  id: true,
  issueId: true,
  fixSubmissionId: true,
  result: true,
  note: true,
  selfVerified: true,
  createdAt: true,
  deployment: { select: deploymentSummarySelect },
  verifiedBy: { select: personSelect },
};

// Detail adds verification state without changing the summary shape used by
// the list. `_count.fixSubmissions` is the stable attempt count.
const issueSelectDetail = {
  ...issueSelectSummary,
  description: true,
  projectId: true,
  pageUrl: true,
  context: true,
  closeNote: true,
  closedAt: true,
  closedBy: { select: personSelect },
  _count: {
    select: {
      comments: { where: { deletedAt: null } },
      fixSubmissions: true,
    },
  },
  fixSubmissions: {
    orderBy: [{ attemptNumber: "desc" }],
    take: 1,
    select: {
      ...fixSelect,
      verification: { select: { id: true } },
    },
  },
  verifications: {
    where: { result: "PASS" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: verificationSelect,
  },
};

const toAssignee = (member) => {
  if (!member) return null;
  return {
    id: member.id,
    name: member.user.name,
    email: member.user.email,
  };
};

const iso = (value) => value.toISOString();

const toFixDeployment = (deployment) => ({
  id: deployment.id,
  label: deployment.label,
  environmentId: deployment.environmentId,
  createdAt: iso(deployment.createdAt),
});

const toFix = (fix) => ({
  id: fix.id,
  issueId: fix.issueId,
  attemptNumber: fix.attemptNumber,
  deployment: toFixDeployment(fix.deployment),
  submittedBy: fix.submittedBy ?? null,
  note: fix.note,
  clientMutationId: fix.clientMutationId,
  createdAt: iso(fix.createdAt),
  withdrawnAt: fix.withdrawnAt ? iso(fix.withdrawnAt) : null,
  withdrawnBy: fix.withdrawnBy ?? null,
});

const toVerification = (verification) => ({
  id: verification.id,
  issueId: verification.issueId,
  fixSubmissionId: verification.fixSubmissionId,
  deployment: toFixDeployment(verification.deployment),
  verifiedBy: verification.verifiedBy ?? null,
  result: verification.result,
  note: verification.note,
  selfVerified: verification.selfVerified,
  createdAt: iso(verification.createdAt),
});

const toPendingFix = (fix) => ({
  id: fix.id,
  issueId: fix.issueId,
  attemptNumber: fix.attemptNumber,
  deployment: toFixDeployment(fix.deployment),
  submittedBy: fix.submittedBy ?? null,
  note: fix.note,
  createdAt: iso(fix.createdAt),
});

const toVerifiedOn = (verification) => ({
  verificationId: verification.id,
  deployment: {
    id: verification.deployment.id,
    label: verification.deployment.label,
  },
  verifiedBy: verification.verifiedBy ?? null,
  selfVerified: verification.selfVerified,
  verifiedAt: iso(verification.createdAt),
});

const toIssueSummary = (issue) => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  type: issue.type,
  priority: issue.priority,
  status: issue.status,
  source: issue.source,
  environment: issue.environment,
  reporter: issue.reporter ?? null,
  guest:
    issue.guestName || issue.guestEmail
      ? {
          name: issue.guestName,
          email: issue.guestEmail,
        }
      : null,
  reviewRound: issue.reviewRound
    ? {
        id: issue.reviewRound.id,
        name: issue.reviewRound.name,
      }
    : null,
  assignee: toAssignee(issue.assignee),
  commentsCount: issue._count.comments,
  closeReason: issue.closeReason ?? null,
  createdAt: iso(issue.createdAt),
  updatedAt: iso(issue.updatedAt),
});

const toIssueDetail = (issue) => {
  const latestFix = issue.fixSubmissions?.[0] ?? null;
  const pendingFix =
    issue.status === "READY_FOR_VERIFICATION" &&
    latestFix &&
    !latestFix.withdrawnAt &&
    !latestFix.verification
      ? toPendingFix(latestFix)
      : null;

  const latestPass = issue.verifications?.[0] ?? null;
  const showsVerification =
    issue.status === "VERIFIED" || (issue.status === "CLOSED" && issue.closeReason === "RESOLVED");

  return {
    ...toIssueSummary(issue),
    description: issue.description,
    projectId: issue.projectId,
    pageUrl: issue.pageUrl,
    context: issue.context,
    attemptCount: issue._count.fixSubmissions,
    pendingFix,
    verifiedOn: showsVerification && latestPass ? toVerifiedOn(latestPass) : null,
    closeNote: issue.closeNote ?? null,
    closedAt: issue.closedAt ? iso(issue.closedAt) : null,
    closedBy: issue.closedBy ?? null,
  };
};

const invalidTransition = (message = "This status change is not allowed") =>
  new AppError(409, "INVALID_TRANSITION", message);
const validationError = (message) => new AppError(400, "VALIDATION_ERROR", message);
const fixAlreadyPending = () =>
  new AppError(
    409,
    "FIX_ALREADY_PENDING",
    "This issue already has a fix awaiting verification"
  );
const fixNotCurrent = () =>
  new AppError(
    409,
    "FIX_NOT_CURRENT",
    "This fix is not the current fix awaiting verification"
  );
const idempotencyKeyReused = () =>
  new AppError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "This clientMutationId was already used with different input"
  );
const deploymentEnvironmentMismatch = () =>
  new AppError(
    409,
    "DEPLOYMENT_ENVIRONMENT_MISMATCH",
    "The deployment belongs to a different environment than this issue"
  );
const deploymentNotNewer = () =>
  new AppError(
    409,
    "DEPLOYMENT_NOT_NEWER",
    "The selected deployment is older than the fix deployment"
  );
const selfVerificationNotAllowed = () =>
  new AppError(
    403,
    "SELF_VERIFICATION_NOT_ALLOWED",
    "Another organization member must verify your fix"
  );
const environmentLocked = () =>
  new AppError(
    409,
    "ENVIRONMENT_LOCKED",
    "The environment cannot change once a fix has been submitted"
  );

// The client is injectable so updateIssue can validate inside its transaction.
async function assertAssigneeInOrg(organizationId, memberId, client = prisma) {
  if (!memberId) return null;
  const member = await client.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!member) {
    throw new AppError(400, "BAD_REQUEST", "Assignee must be a member of this organization");
  }
  return member;
}

const toAssigneeActivityValue = (assignee) =>
  assignee ? { id: assignee.id, name: assignee.user.name } : null;

// Non-status tracked fields only. Lifecycle changes write their own dedicated
// activity type so a single action never produces contradictory entries.
function buildFieldActivityRows(issueId, actorId, existing, input, nextAssignee) {
  const rows = [];
  const add = (type, oldValue, newValue) => {
    rows.push({ issueId, actorId, type, oldValue, newValue });
  };

  if (input.priority !== undefined && input.priority !== existing.priority) {
    add("PRIORITY_CHANGED", existing.priority, input.priority);
  }
  if (input.type !== undefined && input.type !== existing.type) {
    add("TYPE_CHANGED", existing.type, input.type);
  }
  if (input.assigneeId !== undefined && input.assigneeId !== (existing.assignee?.id ?? null)) {
    add(
      "ASSIGNEE_CHANGED",
      toAssigneeActivityValue(existing.assignee),
      toAssigneeActivityValue(nextAssignee)
    );
  }
  if (input.title !== undefined && input.title !== existing.title) {
    add("TITLE_CHANGED", existing.title, input.title);
  }
  if (
    input.description !== undefined &&
    (input.description ?? null) !== (existing.description ?? null)
  ) {
    add("DESCRIPTION_CHANGED", null, null);
  }

  return rows;
}

async function assertEnvironmentInProject(projectId, environmentId, client = prisma) {
  if (!environmentId) return;
  const env = await client.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true },
  });
  if (!env) {
    throw new AppError(400, "BAD_REQUEST", "Environment not found in this project");
  }
}

// Locks the issue row so every lifecycle mutation reads a stable state. The
// query is fully parameterized; no request values are interpolated into SQL.
async function lockIssueRow(tx, projectId, number) {
  const rows = await tx.$queryRaw`
    SELECT id
    FROM "Issue"
    WHERE "projectId" = ${projectId}::uuid AND number = ${number}::int
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw notFound("Issue not found");
  }

  return rows[0].id;
}

async function readIssueForUpdate(tx, projectId, number) {
  const issueId = await lockIssueRow(tx, projectId, number);

  const issue = await tx.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      environmentId: true,
      closeReason: true,
      closeNote: true,
      assignee: { select: { id: true, user: { select: { name: true } } } },
      fixSubmissions: {
        orderBy: [{ attemptNumber: "desc" }],
        take: 1,
        select: {
          ...fixSelect,
          submittedById: true,
          verification: { select: { id: true } },
        },
      },
      _count: { select: { fixSubmissions: true, verifications: true } },
    },
  });

  if (!issue) {
    throw notFound("Issue not found");
  }

  return issue;
}

async function loadIssueDetail(tx, projectId, number) {
  const issue = await tx.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: issueSelectDetail,
  });

  if (!issue) {
    throw notFound("Issue not found");
  }

  return issue;
}

const ALLOWED_STATUS_TRANSITIONS = {
  NEW: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["NEW", "CLOSED"],
  READY_FOR_VERIFICATION: ["IN_PROGRESS", "CLOSED"],
  VERIFIED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["IN_PROGRESS"],
};

function assertStatusTransitionAllowed(from, to) {
  if (!ALLOWED_STATUS_TRANSITIONS[from]?.includes(to)) {
    throw invalidTransition(`Cannot move an issue from ${from} to ${to}`);
  }
}

export async function createIssue(organizationId, projectId, reporterId, input) {
  await assertAssigneeInOrg(organizationId, input.assigneeId);
  await assertEnvironmentInProject(projectId, input.environmentId);

  return prisma.$transaction(async (tx) => {
    const [counter] = await tx.$queryRaw`
      UPDATE "Project"
      SET "lastIssueNumber" = "lastIssueNumber" + 1
      WHERE id = ${projectId}::uuid
      RETURNING "lastIssueNumber"
    `;

    const nextNumber = Number(counter.lastIssueNumber);

    const issue = await tx.issue.create({
      data: {
        projectId,
        number: nextNumber,
        title: input.title,
        description: input.description ?? null,
        type: input.type ?? "BUG",
        priority: input.priority ?? "MEDIUM",
        status: "NEW",
        source: "DASHBOARD",
        reporterId,
        assigneeId: input.assigneeId ?? null,
        environmentId: input.environmentId ?? null,
      },
      select: issueSelectDetail,
    });

    await tx.issueActivity.create({
      data: { issueId: issue.id, actorId: reporterId, type: "ISSUE_CREATED" },
    });

    return toIssueDetail(issue);
  });
}

export async function listIssues(organizationId, projectId, currentMemberId, query) {
  const baseWhere = {
    projectId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.environmentId ? { environmentId: query.environmentId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
  };

  if (query.assigneeId === "me") {
    baseWhere.assigneeId = currentMemberId;
  } else if (query.assigneeId === "unassigned") {
    baseWhere.assigneeId = null;
  } else if (query.assigneeId) {
    baseWhere.assigneeId = query.assigneeId;
  }

  const [totalCount, statusGroups] = await Promise.all([
    prisma.issue.count({ where: baseWhere }),
    prisma.issue.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts = {
    all: totalCount,
    NEW: 0,
    IN_PROGRESS: 0,
    READY_FOR_VERIFICATION: 0,
    VERIFIED: 0,
    CLOSED: 0,
  };

  for (const group of statusGroups) {
    counts[group.status] = group._count._all;
  }

  const listWhere = {
    ...baseWhere,
    ...(query.status ? { status: query.status } : {}),
  };

  const { page = 1, limit = 20 } = query;
  const totalFiltered = query.status ? counts[query.status] : counts.all;

  const issues = await prisma.issue.findMany({
    where: listWhere,
    select: issueSelectSummary,
    orderBy: { number: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    issues: issues.map(toIssueSummary),
    pagination: {
      page,
      limit,
      total: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limit) || 1,
    },
    counts,
  };
}

export async function getIssue(projectId, number) {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: issueSelectDetail,
  });

  if (!issue) {
    throw notFound("Issue not found");
  }

  return toIssueDetail(issue);
}

export async function updateIssue(organizationId, projectId, number, actorId, input) {
  return prisma.$transaction(async (tx) => {
    const existing = await readIssueForUpdate(tx, projectId, number);
    const latestFix = existing.fixSubmissions[0] ?? null;
    const fixCount = existing._count.fixSubmissions;

    if (input.environmentId !== undefined) {
      if (fixCount > 0 && input.environmentId !== existing.environmentId) {
        throw environmentLocked();
      }
      await assertEnvironmentInProject(projectId, input.environmentId, tx);
    }

    const nextAssignee =
      input.assigneeId !== undefined && input.assigneeId !== null
        ? await assertAssigneeInOrg(organizationId, input.assigneeId, tx)
        : null;

    const data = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    };

    const activityRows = buildFieldActivityRows(
      existing.id,
      actorId,
      existing,
      input,
      nextAssignee
    );
    const addActivity = (type, oldValue, newValue) => {
      activityRows.push({ issueId: existing.id, actorId, type, oldValue, newValue });
    };

    const nextStatus = input.status;

    if (nextStatus !== undefined && nextStatus !== existing.status) {
      assertStatusTransitionAllowed(existing.status, nextStatus);

      const isClosing = nextStatus === "CLOSED";
      const isReopening =
        (existing.status === "VERIFIED" || existing.status === "CLOSED") &&
        nextStatus === "IN_PROGRESS";
      const isWithdrawal =
        existing.status === "READY_FOR_VERIFICATION" && nextStatus === "IN_PROGRESS";

      if (isClosing) {
        const reason =
          existing.status === "VERIFIED" ? "RESOLVED" : input.closeReason ?? null;

        if (existing.status === "VERIFIED") {
          if (input.closeReason !== undefined && input.closeReason !== "RESOLVED") {
            throw invalidTransition("A verified issue can only be closed as RESOLVED");
          }
        } else if (!reason) {
          throw validationError("A close reason is required");
        } else if (reason === "RESOLVED") {
          throw invalidTransition(
            "RESOLVED can only be used when closing a verified issue"
          );
        }

        const closeNote = input.closeNote ?? null;
        if (reason === "OTHER" && !closeNote) {
          throw validationError("A close note is required when the reason is OTHER");
        }

        data.status = "CLOSED";
        data.closeReason = reason;
        data.closeNote = closeNote;
        data.closedAt = new Date();
        data.closedById = actorId;

        addActivity("ISSUE_CLOSED", existing.status, {
          closeReason: reason,
          closeNote,
        });
      } else if (isReopening) {
        data.status = "IN_PROGRESS";
        data.closeReason = null;
        data.closeNote = null;
        data.closedAt = null;
        data.closedById = null;

        addActivity("ISSUE_REOPENED", existing.status, "IN_PROGRESS");
      } else if (isWithdrawal) {
        if (!latestFix || latestFix.withdrawnAt || latestFix.verification) throw fixNotCurrent();
        if (latestFix.submittedById !== actorId) {
          throw forbidden("Only the submitter can withdraw this fix");
        }

        const withdrawnAt = new Date();
        const withdrawn = await tx.fixSubmission.updateMany({
          where: { id: latestFix.id, withdrawnAt: null },
          data: { withdrawnAt, withdrawnById: actorId },
        });

        if (withdrawn.count !== 1) {
          throw fixNotCurrent();
        }

        data.status = "IN_PROGRESS";
        addActivity("FIX_WITHDRAWN", {
          fixId: latestFix.id,
          attemptNumber: latestFix.attemptNumber,
          deploymentId: latestFix.deployment.id,
          deploymentLabel: latestFix.deployment.label,
        }, null);
      } else {
        data.status = nextStatus;
        addActivity("STATUS_CHANGED", existing.status, nextStatus);
      }
    } else if (nextStatus === "CLOSED" && existing.status === "CLOSED") {
      // Changing closure metadata after the fact would rewrite history.
      const sameReason =
        input.closeReason === undefined || input.closeReason === existing.closeReason;
      const sameNote =
        input.closeNote === undefined ||
        (input.closeNote ?? null) === (existing.closeNote ?? null);

      if (!sameReason || !sameNote) {
        throw invalidTransition("A closed issue's close details cannot be changed");
      }
    }

    const changed = Object.entries(data).some(([field, value]) =>
      value !== (field === "assigneeId" ? existing.assignee?.id ?? null : existing[field])
    );
    if (!changed) return toIssueDetail(await loadIssueDetail(tx, projectId, number));

    const updated = await tx.issue.update({
      where: { id: existing.id },
      data,
      select: issueSelectDetail,
    });

    if (activityRows.length > 0) {
      await tx.issueActivity.createMany({ data: activityRows });
    }

    return toIssueDetail(updated);
  });
}

export async function createFixSubmission(projectId, number, actorId, input) {
  return prisma.$transaction(async (tx) => {
    const issue = await readIssueForUpdate(tx, projectId, number);

    // Idempotency is checked after authorization and before transition checks,
    // so an uncertain retry still returns the earlier successful result.
    const existingFix = await tx.fixSubmission.findFirst({
      where: {
        issueId: issue.id,
        submittedById: actorId,
        clientMutationId: input.clientMutationId,
      },
      select: fixSelect,
    });

    if (existingFix) {
      const sameInput =
        existingFix.deployment.id === input.deploymentId &&
        (existingFix.note ?? null) === (input.note ?? null);

      if (!sameInput) throw idempotencyKeyReused();

      const detail = await loadIssueDetail(tx, projectId, number);
      return { fix: toFix(existingFix), issue: toIssueDetail(detail), created: false };
    }

    if (issue.status === "READY_FOR_VERIFICATION") throw fixAlreadyPending();
    if (issue.status === "VERIFIED" || issue.status === "CLOSED") {
      throw invalidTransition(`Cannot submit a fix while the issue is ${issue.status}`);
    }

    const deployment = await tx.deployment.findFirst({
      where: { id: input.deploymentId, environment: { projectId } },
      select: deploymentSummarySelect,
    });

    if (!deployment) throw notFound("Deployment not found");

    if (issue.environmentId && issue.environmentId !== deployment.environmentId) {
      throw deploymentEnvironmentMismatch();
    }

    const aggregate = await tx.fixSubmission.aggregate({
      where: { issueId: issue.id },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (aggregate._max.attemptNumber ?? 0) + 1;

    const fix = await tx.fixSubmission.create({
      data: {
        issueId: issue.id,
        deploymentId: deployment.id,
        submittedById: actorId,
        note: input.note ?? null,
        clientMutationId: input.clientMutationId,
        attemptNumber,
      },
      select: fixSelect,
    });

    await tx.issue.update({
      where: { id: issue.id },
      data: {
        status: "READY_FOR_VERIFICATION",
        // A fix on an unassigned issue anchors the issue to the deployment's
        // environment so later attempts cannot silently switch environments.
        ...(issue.environmentId ? {} : { environmentId: deployment.environmentId }),
      },
    });

    await tx.issueActivity.create({
      data: {
        issueId: issue.id,
        actorId,
        type: "FIX_SUBMITTED",
        newValue: {
          fixId: fix.id,
          attemptNumber,
          deploymentId: deployment.id,
          deploymentLabel: deployment.label,
        },
      },
    });

    const detail = await loadIssueDetail(tx, projectId, number);
    return { fix: toFix(fix), issue: toIssueDetail(detail), created: true };
  });
}

const isSameOrNewerDeployment = (candidate, baseline) => {
  const candidateTime = candidate.createdAt.getTime();
  const baselineTime = baseline.createdAt.getTime();

  return (
    candidateTime > baselineTime ||
    (candidateTime === baselineTime && candidate.id >= baseline.id)
  );
};

async function runVerificationTransaction(work) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "ReadCommitted",
      });
    } catch (error) {
      if (attempt < 2 && error?.code === "P2034") {
        continue;
      }
      throw error;
    }
  }
}

export async function createVerification(organizationId, projectId, number, actorId, input) {
  return runVerificationTransaction(async (tx) => {
    await lockOrganizationMembership(tx, organizationId);
    const membership = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorId } },
      select: { id: true },
    });
    if (!membership) throw notFound("Organization not found");

    const issue = await readIssueForUpdate(tx, projectId, number);

    const fix = await tx.fixSubmission.findFirst({
      where: { id: input.fixSubmissionId, issueId: issue.id },
      select: {
        id: true,
        attemptNumber: true,
        deploymentId: true,
        submittedById: true,
        withdrawnAt: true,
        deployment: { select: deploymentSummarySelect },
        verification: { select: { id: true } },
      },
    });

    if (!fix) throw notFound("Fix submission not found");

    const existingVerification = await tx.verification.findFirst({
      where: {
        issueId: issue.id,
        verifiedById: actorId,
        clientMutationId: input.clientMutationId,
      },
      select: verificationSelect,
    });

    if (existingVerification) {
      const sameFix = existingVerification.fixSubmissionId === input.fixSubmissionId;
      const sameResult = existingVerification.result === input.result;
      const sameNote = (existingVerification.note ?? null) === (input.note ?? null);

      const sameDeployment =
        existingVerification.deployment.id === (input.deploymentId ?? fix.deploymentId);

      if (!sameFix || !sameResult || !sameNote || !sameDeployment) {
        throw idempotencyKeyReused();
      }

      const detail = await loadIssueDetail(tx, projectId, number);
      return {
        verification: toVerification(existingVerification),
        issue: toIssueDetail(detail),
        created: false,
      };
    }

    if (issue.status !== "READY_FOR_VERIFICATION") throw fixNotCurrent();

    if (fix.withdrawnAt || fix.verification) throw fixNotCurrent();

    if (issue.fixSubmissions[0]?.id !== fix.id) throw fixNotCurrent();

    let selfVerified = false;
    if (fix.submittedById === actorId) {
      const memberCount = await tx.organizationMember.count({
        where: { organizationId },
      });

      if (memberCount !== 1) throw selfVerificationNotAllowed();
      selfVerified = true;
    }

    const deploymentId = input.deploymentId ?? fix.deploymentId;
    const deployment = await tx.deployment.findFirst({
      where: { id: deploymentId, environment: { projectId } },
      select: deploymentSummarySelect,
    });

    if (!deployment) throw notFound("Deployment not found");
    if (deployment.environmentId !== fix.deployment.environmentId) {
      throw deploymentEnvironmentMismatch();
    }
    if (!isSameOrNewerDeployment(deployment, fix.deployment)) {
      throw deploymentNotNewer();
    }

    const verification = await tx.verification.create({
      data: {
        issueId: issue.id,
        fixSubmissionId: fix.id,
        deploymentId: deployment.id,
        verifiedById: actorId,
        result: input.result,
        note: input.note ?? null,
        selfVerified,
        clientMutationId: input.clientMutationId,
      },
      select: verificationSelect,
    });

    await tx.issue.update({
      where: { id: issue.id },
      data: {
        status: input.result === "PASS" ? "VERIFIED" : "IN_PROGRESS",
      },
    });

    await tx.issueActivity.create({
      data: {
        issueId: issue.id,
        actorId,
        type: input.result === "PASS" ? "VERIFICATION_PASSED" : "VERIFICATION_FAILED",
        oldValue: {
          fixId: fix.id,
          attemptNumber: fix.attemptNumber,
          deploymentId: fix.deployment.id,
          deploymentLabel: fix.deployment.label,
        },
        newValue: {
          verificationId: verification.id,
          fixId: fix.id,
          deploymentId: deployment.id,
          deploymentLabel: deployment.label,
          result: input.result,
          selfVerified,
        },
      },
    });

    const detail = await loadIssueDetail(tx, projectId, number);
    return {
      verification: toVerification(verification),
      issue: toIssueDetail(detail),
      created: true,
    };
  });
}

export async function listAttempts(projectId, number) {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });

  if (!issue) {
    throw notFound("Issue not found");
  }

  const fixes = await prisma.fixSubmission.findMany({
    where: { issueId: issue.id },
    orderBy: [{ attemptNumber: "desc" }],
    select: {
      ...fixSelect,
      verification: { select: verificationSelect },
    },
  });

  return fixes.map((fix) => ({
    attempt: fix.attemptNumber,
    fix: toFix(fix),
    verification: fix.verification ? toVerification(fix.verification) : null,
  }));
}

export async function deleteIssue(projectId, number) {
  return prisma.$transaction(async (tx) => {
    const existing = await readIssueForUpdate(tx, projectId, number);

    if (existing._count.fixSubmissions > 0 || existing._count.verifications > 0) {
      throw new AppError(
        409,
        "ISSUE_HAS_VERIFICATION_HISTORY",
        "Issues with fix or verification history cannot be deleted"
      );
    }

    await tx.issue.delete({ where: { id: existing.id } });

    return { deleted: true, number };
  });
}
