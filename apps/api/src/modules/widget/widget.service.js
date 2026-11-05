import { randomBytes } from "node:crypto";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../auth/tokens.js";

const widgetIssueSelect = {
  id: true,
  number: true,
  title: true,
  description: true,
  type: true,
  priority: true,
  status: true,
  source: true,
  projectId: true,
  pageUrl: true,
  context: true,
  guestName: true,
  guestEmail: true,
  createdAt: true,
  updatedAt: true,
  environment: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  reviewRound: {
    select: {
      id: true,
      name: true,
    },
  },
  reporter: {
    select: {
      id: true,
      name: true,
    },
  },
  assignee: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

export function toWidgetIssueResponse(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    priority: issue.priority,
    status: issue.status,
    source: issue.source,
    pageUrl: issue.pageUrl,
    environment: issue.environment,
    reporter: issue.reporter
      ? {
          id: issue.reporter.id,
          name: issue.reporter.name,
        }
      : null,
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
    assignee: issue.assignee
      ? {
          id: issue.assignee.id,
          name: issue.assignee.user.name,
        }
      : null,
    context: issue.context,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

export function matchesExistingIssue(existing, input) {
  const titleMatches = existing.title === input.title;
  const descMatches = (existing.description ?? null) === (input.description ?? null);
  const typeMatches = existing.type === (input.type ?? "BUG");
  const priorityMatches = existing.priority === (input.priority ?? "MEDIUM");
  const pageMatches = existing.pageUrl === input.pageUrl;
  return titleMatches && descMatches && typeMatches && priorityMatches && pageMatches;
}

export function extractOrigin(urlStr) {
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

export async function exchangeWidgetHandoff(rawHandoffCode, origin, { ipAddress, userAgent } = {}) {
  const codeHash = hashToken(rawHandoffCode);

  const handoff = await prisma.guestHandoffCode.findUnique({
    where: { codeHash },
    include: {
      guestLink: {
        include: {
          reviewRound: {
            include: {
              environment: true,
              project: true,
            },
          },
        },
      },
    },
  });

  if (!handoff || handoff.usedAt !== null) {
    throw unauthorized("Invalid or already used handoff code");
  }

  if (handoff.expiresAt < new Date()) {
    throw unauthorized("Handoff code has expired");
  }

  if (handoff.guestLink.revokedAt !== null) {
    throw unauthorized("Review invitation has been revoked");
  }

  if (handoff.guestLink.expiresAt < new Date()) {
    throw unauthorized("Review invitation has expired");
  }

  if (handoff.guestLink.reviewRound.status !== "ACTIVE") {
    throw forbidden("Review round is not active");
  }

  const expectedOrigin = extractOrigin(handoff.guestLink.reviewRound.environment.url);
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    throw forbidden("Origin not allowed for this environment");
  }

  // Atomically mark handoff code as used to guard against concurrent replay
  const updated = await prisma.guestHandoffCode.updateMany({
    where: { id: handoff.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (updated.count === 0) {
    throw unauthorized("Invalid or already used handoff code");
  }

  const rawSessionToken = `pf_ws_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashToken(rawSessionToken);
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours TTL

  await prisma.guestSession.create({
    data: {
      guestLinkId: handoff.guestLinkId,
      tokenHash,
      expiresAt,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    },
  });

  return {
    allowedOrigin: expectedOrigin,
    sessionToken: rawSessionToken,
    expiresAt: expiresAt.toISOString(),
    project: {
      id: handoff.guestLink.reviewRound.project.id,
      name: handoff.guestLink.reviewRound.project.name,
      slug: handoff.guestLink.reviewRound.project.slug,
    },
    environment: {
      id: handoff.guestLink.reviewRound.environment.id,
      name: handoff.guestLink.reviewRound.environment.name,
      slug: handoff.guestLink.reviewRound.environment.slug,
      url: handoff.guestLink.reviewRound.environment.url,
    },
    reviewRound: {
      id: handoff.guestLink.reviewRound.id,
      name: handoff.guestLink.reviewRound.name,
    },
    reviewer: {
      name: handoff.guestLink.reviewerName,
      email: handoff.guestLink.reviewerEmail,
    },
  };
}

export async function createWidgetIssue(rawSessionToken, origin, input) {
  if (!rawSessionToken) {
    throw unauthorized("Bearer session token is required");
  }

  const tokenHash = hashToken(rawSessionToken);

  const session = await prisma.guestSession.findUnique({
    where: { tokenHash },
    include: {
      guestLink: {
        include: {
          reviewRound: {
            include: {
              environment: true,
              project: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw unauthorized("Invalid or expired session token");
  }

  if (session.revokedAt !== null) {
    throw unauthorized("Session has been revoked");
  }

  if (session.expiresAt < new Date()) {
    throw unauthorized("Session has expired");
  }

  if (session.guestLink.revokedAt !== null) {
    throw unauthorized("Review invitation has been revoked");
  }

  if (session.guestLink.expiresAt < new Date()) {
    throw unauthorized("Review invitation has expired");
  }

  if (session.guestLink.reviewRound.status !== "ACTIVE") {
    throw forbidden("Review round is not active");
  }

  const expectedOrigin = extractOrigin(session.guestLink.reviewRound.environment.url);
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    throw forbidden("Origin not allowed for this environment");
  }

  const pageOrigin = extractOrigin(input.pageUrl);
  if (!pageOrigin || (expectedOrigin && pageOrigin !== expectedOrigin)) {
    throw badRequest("Page URL origin must match the review environment origin");
  }

  // Idempotency check: if clientMutationId was provided and exists for this guest link,
  // return the existing issue if parameters match, or reject if they conflict.
  if (input.clientMutationId) {
    const existing = await prisma.issue.findUnique({
      where: {
        guestLinkId_clientMutationId: {
          guestLinkId: session.guestLinkId,
          clientMutationId: input.clientMutationId,
        },
      },
      select: widgetIssueSelect,
    });

    if (existing) {
      if (!matchesExistingIssue(existing, input)) {
        throw conflict(
          "Idempotency conflict: clientMutationId was previously used with different request parameters"
        );
      }

      return {
        allowedOrigin: expectedOrigin,
        isDuplicate: true,
        issue: toWidgetIssueResponse(existing),
      };
    }
  }

  const projectId = session.guestLink.reviewRound.projectId;

  let issue;
  try {
    issue = await prisma.$transaction(async (tx) => {
      const [counter] = await tx.$queryRaw`
        UPDATE "Project"
        SET "lastIssueNumber" = "lastIssueNumber" + 1
        WHERE id = ${projectId}::uuid
        RETURNING "lastIssueNumber"
      `;

      const nextNumber = Number(counter.lastIssueNumber);

      const created = await tx.issue.create({
        data: {
          projectId,
          number: nextNumber,
          title: input.title,
          description: input.description ?? null,
          type: input.type ?? "BUG",
          priority: input.priority ?? "MEDIUM",
          status: "NEW",
          source: "WIDGET",
          reporterId: null,
          assigneeId: null,
          environmentId: session.guestLink.reviewRound.environmentId,
          reviewRoundId: session.guestLink.reviewRoundId,
          guestLinkId: session.guestLinkId,
          guestName: session.guestLink.reviewerName,
          guestEmail: session.guestLink.reviewerEmail,
          clientMutationId: input.clientMutationId ?? null,
          pageUrl: input.pageUrl,
          context: input.context,
        },
        select: widgetIssueSelect,
      });

      return created;
    });
  } catch (err) {
    if (err?.code === "P2002" && input.clientMutationId) {
      // Concurrent request with same clientMutationId won the race.
      // The transaction rolled back, so lastIssueNumber was not consumed.
      const existing = await prisma.issue.findUnique({
        where: {
          guestLinkId_clientMutationId: {
            guestLinkId: session.guestLinkId,
            clientMutationId: input.clientMutationId,
          },
        },
        select: widgetIssueSelect,
      });

      if (existing) {
        if (!matchesExistingIssue(existing, input)) {
          throw conflict(
            "Idempotency conflict: clientMutationId was previously used with different request parameters"
          );
        }

        return {
          allowedOrigin: expectedOrigin,
          isDuplicate: true,
          issue: toWidgetIssueResponse(existing),
        };
      }
    }
    throw err;
  }

  return {
    allowedOrigin: expectedOrigin,
    isDuplicate: false,
    issue: toWidgetIssueResponse(issue),
  };
}
