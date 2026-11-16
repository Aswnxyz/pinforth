import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const commentSelect = {
  id: true,
  issueId: true,
  body: true,
  visibility: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  author: { select: { id: true, name: true } },
};

const activitySelect = {
  id: true,
  type: true,
  oldValue: true,
  newValue: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
};

const uuidSchema = z.uuid();

const toComment = (comment) => ({
  id: comment.id,
  issueId: comment.issueId,
  author: comment.author ?? null,
  // Deleted bodies are never serialized.
  body: comment.deletedAt ? null : comment.body,
  visibility: comment.visibility,
  createdAt: comment.createdAt.toISOString(),
  editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
  deletedAt: comment.deletedAt ? comment.deletedAt.toISOString() : null,
});

const toActivity = (activity) => ({
  id: activity.id,
  type: "ACTIVITY",
  activityType: activity.type,
  actor: activity.actor ?? null,
  oldValue: activity.oldValue,
  newValue: activity.newValue,
  createdAt: activity.createdAt.toISOString(),
});

async function findIssueId(projectId, number) {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });

  if (!issue) {
    throw notFound("Issue not found");
  }

  return issue.id;
}

// Scoped by project + issue number so a comment ID from another tenant is a 404.
async function findComment(projectId, number, commentId) {
  const comment = await prisma.issueComment.findFirst({
    where: { id: commentId, issue: { projectId, number } },
    select: commentSelect,
  });

  if (!comment) {
    throw notFound("Comment not found");
  }

  return comment;
}

export async function createComment(projectId, number, authorId, input) {
  const issueId = await findIssueId(projectId, number);

  const comment = await prisma.issueComment.create({
    data: {
      issueId,
      authorId,
      body: input.body,
      visibility: input.visibility,
    },
    select: commentSelect,
  });

  return toComment(comment);
}

export async function updateComment(projectId, number, commentId, authorId, input) {
  const existing = await findComment(projectId, number, commentId);

  if (existing.deletedAt) {
    throw conflict("Comment has been deleted");
  }

  if (existing.author?.id !== authorId) {
    throw forbidden("Only the author can edit this comment");
  }

  const comment = await prisma.issueComment.update({
    where: { id: existing.id },
    data: { body: input.body, editedAt: new Date() },
    select: commentSelect,
  });

  return toComment(comment);
}

export async function deleteComment(projectId, number, commentId, actorId, role) {
  const existing = await findComment(projectId, number, commentId);

  // Repeated deletion is a no-op but still succeeds.
  if (existing.deletedAt) {
    return { deleted: true, commentId: existing.id };
  }

  const isAuthor = existing.author?.id === actorId;
  const isManager = role === "OWNER" || role === "ADMIN";

  if (!isAuthor && !isManager) {
    throw forbidden("You cannot delete this comment");
  }

  await prisma.issueComment.updateMany({
    where: { id: existing.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return { deleted: true, commentId: existing.id };
}

const encodeCursor = (createdAt, id) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

export function decodeTimelineCursor(rawCursor) {
  if (!/^[A-Za-z0-9_-]+$/.test(rawCursor)) {
    throw badRequest("Invalid cursor");
  }

  const [createdAtRaw, id, ...rest] = Buffer.from(rawCursor, "base64url")
    .toString("utf8")
    .split("|");
  const createdAt = new Date(createdAtRaw);

  if (
    rest.length > 0 ||
    Number.isNaN(createdAt.getTime()) ||
    !uuidSchema.safeParse(id).success
  ) {
    throw badRequest("Invalid cursor");
  }

  return { createdAt, id };
}

const compareTimelineEntries = (a, b) =>
  a.sortCreatedAt.getTime() - b.sortCreatedAt.getTime() ||
  (a.sortId < b.sortId ? -1 : a.sortId > b.sortId ? 1 : 0);

export async function getIssueTimeline(projectId, number, query) {
  const issueId = await findIssueId(projectId, number);
  const limit = query.limit;
  const cursor = query.cursor ? decodeTimelineCursor(query.cursor) : null;

  // Keyset pagination on (createdAt, id): deterministic across both tables.
  const cursorWhere = cursor
    ? {
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }] },
        ],
      }
    : {};
  const where = { issueId, ...cursorWhere };
  const take = limit + 1;

  const [comments, activities] = await Promise.all([
    prisma.issueComment.findMany({
      where,
      select: commentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.issueActivity.findMany({
      where,
      select: activitySelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    }),
  ]);

  const merged = [
    ...comments.map((comment) => ({
      sortCreatedAt: comment.createdAt,
      sortId: comment.id,
      entry: { type: "COMMENT", ...toComment(comment) },
    })),
    ...activities.map((activity) => ({
      sortCreatedAt: activity.createdAt,
      sortId: activity.id,
      entry: toActivity(activity),
    })),
  ].sort(compareTimelineEntries);

  const hasMore = merged.length > limit;
  const page = merged.slice(0, limit);
  const last = page.at(-1);

  return {
    timeline: page.map(({ entry }) => entry),
    pagination: {
      limit,
      nextCursor: hasMore && last ? encodeCursor(last.sortCreatedAt, last.sortId) : null,
      hasMore,
    },
  };
}
