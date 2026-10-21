import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { generateOpaqueToken, hashToken, signAccessToken } from "./tokens.js";

// Two tabs refreshing at once both send the same token. The loser of that race
// within this window gets a plain 401 instead of having the whole family revoked.
const ROTATION_GRACE_MS = 10_000;

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

const invalidRefresh = () =>
  new AppError(401, "INVALID_REFRESH_TOKEN", "Session is invalid or has expired");

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

const metaColumns = (meta: ClientMeta) => ({
  userAgent: meta.userAgent?.slice(0, 512) ?? null,
  ipAddress: meta.ipAddress?.slice(0, 45) ?? null,
});

async function issueTokens(
  session: { id: string; userId: string; familyId: string },
  refreshToken: string,
  refreshExpiresAt: Date
) {
  const sessionId = session.id;
  const { token, expiresAt } = await signAccessToken({
    userId: session.userId,
    sessionId,
    familyId: session.familyId,
  });

  return {
    accessToken: token,
    accessExpiresAt: expiresAt,
    refreshToken,
    refreshExpiresAt,
    sessionId,
  } satisfies IssuedTokens;
}

export async function createSession(userId: string, meta: ClientMeta): Promise<IssuedTokens> {
  const refreshToken = generateOpaqueToken();
  const expiresAt = refreshExpiry();

  const session = await prisma.session.create({
    data: {
      userId,
      familyId: randomUUID(),
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      ...metaColumns(meta),
    },
  });

  return issueTokens(session, refreshToken, expiresAt);
}

export async function rotateSession(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens> {
  const current = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
  });

  if (!current) throw invalidRefresh();

  if (current.revokedAt) {
    const wasRotatedJustNow =
      current.replacedById !== null &&
      Date.now() - current.revokedAt.getTime() < ROTATION_GRACE_MS;

    // An old token coming back outside the race window means it was stolen:
    // kill every session descended from the same login.
    if (!wasRotatedJustNow) {
      await revokeFamily(current.familyId);
    }

    throw invalidRefresh();
  }

  if (current.expiresAt.getTime() <= Date.now()) {
    await prisma.session.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    throw invalidRefresh();
  }

  const nextToken = generateOpaqueToken();
  const nextExpiresAt = refreshExpiry();

  const next = await prisma.$transaction(async (tx) => {
    // Conditional update: only one concurrent request can claim the old token.
    const claimed = await tx.session.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count === 0) throw invalidRefresh();

    const created = await tx.session.create({
      data: {
        userId: current.userId,
        familyId: current.familyId,
        refreshTokenHash: hashToken(nextToken),
        expiresAt: nextExpiresAt,
        ...metaColumns(meta),
      },
    });

    await tx.session.update({ where: { id: current.id }, data: { replacedById: created.id } });

    return created;
  });

  return issueTokens(next, nextToken, nextExpiresAt);
}

// Logout ends the whole login (every rotation of it), not just the current row.
export async function revokeFamilyByToken(refreshToken: string) {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    select: { familyId: true },
  });

  if (session) await revokeFamily(session.familyId);
}

export async function revokeFamily(familyId: string) {
  await prisma.session.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// A family is live while its latest session is unrevoked. Logout, logout-all,
// password reset and reuse detection all revoke it, cutting off access tokens at once.
export async function isFamilyActive(familyId: string, userId: string) {
  const live = await prisma.session.findFirst({
    where: { familyId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  return live !== null;
}
