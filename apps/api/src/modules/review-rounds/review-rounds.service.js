import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../auth/tokens.js";

const environmentSelect = {
  id: true,
  name: true,
  slug: true,
  url: true,
};

export async function createReviewRound(projectId, userId, input) {
  const environment = await prisma.environment.findFirst({
    where: { id: input.environmentId, projectId },
    select: environmentSelect,
  });

  if (!environment) {
    throw badRequest("Environment not found in this project");
  }

  const reviewRound = await prisma.reviewRound.create({
    data: {
      projectId,
      environmentId: input.environmentId,
      name: input.name,
      description: input.description ?? null,
      status: "ACTIVE",
      createdById: userId,
    },
    include: {
      environment: { select: environmentSelect },
    },
  });

  return {
    id: reviewRound.id,
    projectId: reviewRound.projectId,
    environmentId: reviewRound.environmentId,
    name: reviewRound.name,
    description: reviewRound.description,
    status: reviewRound.status,
    environment: reviewRound.environment,
    activeLinksCount: 0,
    issuesCount: 0,
    createdAt: reviewRound.createdAt.toISOString(),
    updatedAt: reviewRound.updatedAt.toISOString(),
  };
}

export async function listReviewRounds(projectId, query = {}) {
  const where = {
    projectId,
    ...(query.status ? { status: query.status } : {}),
  };

  const rounds = await prisma.reviewRound.findMany({
    where,
    include: {
      environment: { select: environmentSelect },
      _count: {
        select: {
          issues: true,
          guestLinks: {
            where: {
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rounds.map((round) => ({
    id: round.id,
    projectId: round.projectId,
    environmentId: round.environmentId,
    name: round.name,
    description: round.description,
    status: round.status,
    environment: round.environment,
    activeLinksCount: round._count.guestLinks,
    issuesCount: round._count.issues,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  }));
}

export async function createGuestLink(projectId, roundId, userId, input) {
  const round = await prisma.reviewRound.findFirst({
    where: { id: roundId, projectId },
    select: { id: true, status: true },
  });

  if (!round) {
    throw notFound("Review round not found");
  }

  if (round.status !== "ACTIVE") {
    throw badRequest("Review round is not active");
  }

  const rawToken = `pf_gr_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashToken(rawToken);
  const expiresInDays = input.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const guestLink = await prisma.guestAccessLink.create({
    data: {
      reviewRoundId: roundId,
      tokenHash,
      reviewerName: input.reviewerName ?? null,
      reviewerEmail: input.reviewerEmail ?? null,
      expiresAt,
      createdById: userId,
    },
    select: {
      id: true,
      reviewRoundId: true,
      reviewerName: true,
      reviewerEmail: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  const invitationUrl = `${env.APP_URL}/review#token=${rawToken}`;

  return {
    guestLink: {
      id: guestLink.id,
      reviewRoundId: guestLink.reviewRoundId,
      reviewerName: guestLink.reviewerName,
      reviewerEmail: guestLink.reviewerEmail,
      expiresAt: guestLink.expiresAt.toISOString(),
      revokedAt: guestLink.revokedAt ? guestLink.revokedAt.toISOString() : null,
      createdAt: guestLink.createdAt.toISOString(),
    },
    token: rawToken,
    invitationUrl,
  };
}

export async function revokeGuestLink(projectId, roundId, linkId) {
  const link = await prisma.guestAccessLink.findFirst({
    where: {
      id: linkId,
      reviewRoundId: roundId,
      reviewRound: { projectId },
    },
    select: { id: true },
  });

  if (!link) {
    throw notFound("Guest link not found");
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.guestAccessLink.update({
      where: { id: linkId },
      data: { revokedAt: now },
    }),
    prisma.guestSession.updateMany({
      where: { guestLinkId: linkId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  return { revoked: true, id: linkId };
}
