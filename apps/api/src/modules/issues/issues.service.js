import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

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

const issueSelectSummary = {
  id: true,
  number: true,
  title: true,
  type: true,
  priority: true,
  status: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  environment: { select: environmentSelect },
  reporter: { select: userSelect },
  assignee: { select: memberSelect },
};

const issueSelectDetail = {
  ...issueSelectSummary,
  description: true,
  projectId: true,
  pageUrl: true,
  context: true,
};

const toAssignee = (member) => {
  if (!member) return null;
  return {
    id: member.id,
    name: member.user.name,
    email: member.user.email,
  };
};

const toIssueSummary = (issue) => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  type: issue.type,
  priority: issue.priority,
  status: issue.status,
  source: issue.source,
  environment: issue.environment,
  reporter: issue.reporter,
  assignee: toAssignee(issue.assignee),
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
});

const toIssueDetail = (issue) => ({
  ...toIssueSummary(issue),
  description: issue.description,
  projectId: issue.projectId,
  pageUrl: issue.pageUrl,
  context: issue.context,
});

async function assertAssigneeInOrg(organizationId, memberId) {
  if (!memberId) return;
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });
  if (!member) {
    throw badRequest("Assignee must be a member of this organization");
  }
}

async function assertEnvironmentInProject(projectId, environmentId) {
  if (!environmentId) return;
  const env = await prisma.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true },
  });
  if (!env) {
    throw badRequest("Environment not found in this project");
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

export async function updateIssue(organizationId, projectId, number, input) {
  const existing = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });

  if (!existing) {
    throw notFound("Issue not found");
  }

  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    await assertAssigneeInOrg(organizationId, input.assigneeId);
  }

  if (input.environmentId !== undefined && input.environmentId !== null) {
    await assertEnvironmentInProject(projectId, input.environmentId);
  }

  const updated = await prisma.issue.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    },
    select: issueSelectDetail,
  });

  return toIssueDetail(updated);
}

export async function deleteIssue(projectId, number) {
  const existing = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });

  if (!existing) {
    throw notFound("Issue not found");
  }

  await prisma.issue.delete({ where: { id: existing.id } });

  return { deleted: true, number };
}
