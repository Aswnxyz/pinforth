import type { Prisma, VerificationTokenType } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { generateOpaqueToken, hashToken } from "./tokens.js";

type Tx = Prisma.TransactionClient;

// Issues a new single-use token and invalidates any earlier unused one of the
// same type, so only the most recent email link works.
export async function issueVerificationToken(userId: string, type: VerificationTokenType, ttlMinutes: number) {
  const token = generateOpaqueToken();
  const now = new Date();

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.verificationToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000),
      },
    }),
  ]);

  return token;
}

// Atomically marks a token used. Returns its userId, or null if it's unknown,
// the wrong type, expired or already used.
export async function consumeVerificationToken(tx: Tx, token: string, type: VerificationTokenType) {
  const record = await tx.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, type: true },
  });

  if (!record || record.type !== type) return null;

  // Conditional update so two simultaneous requests can't both use one token.
  const claimed = await tx.verificationToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  return claimed.count === 1 ? record.userId : null;
}
