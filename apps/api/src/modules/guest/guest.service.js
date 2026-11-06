import { randomBytes } from "node:crypto";
import { forbidden, unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../auth/tokens.js";

export async function exchangeGuestToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const link = await prisma.guestAccessLink.findUnique({
    where: { tokenHash },
    include: {
      reviewRound: {
        include: {
          environment: true,
          project: true,
        },
      },
    },
  });

  if (!link) {
    throw unauthorized("Invalid invitation token");
  }

  if (link.revokedAt) {
    throw unauthorized("Review invitation has been revoked");
  }

  if (link.expiresAt < new Date()) {
    throw unauthorized("Review invitation has expired");
  }

  if (link.reviewRound.status !== "ACTIVE") {
    throw forbidden("Review round is not active");
  }

  const rawHandoffCode = `pf_hc_${randomBytes(24).toString("base64url")}`;
  const codeHash = hashToken(rawHandoffCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

  await prisma.guestHandoffCode.create({
    data: {
      guestLinkId: link.id,
      codeHash,
      expiresAt,
    },
  });

  const baseUrl = link.reviewRound.environment.url.replace(/#.*$/, "");
  const stagingUrl = `${baseUrl}#pf_handoff=${rawHandoffCode}`;

  return {
    handoffCode: rawHandoffCode,
    targetUrl: link.reviewRound.environment.url,
    stagingUrl,
    expiresAt: expiresAt.toISOString(),
    reviewRound: {
      id: link.reviewRound.id,
      name: link.reviewRound.name,
    },
    reviewer: {
      name: link.reviewerName,
      email: link.reviewerEmail,
    },
  };
}
