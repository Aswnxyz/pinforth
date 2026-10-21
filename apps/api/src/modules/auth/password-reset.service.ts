import type { ForgotPasswordInput, ResetPasswordInput } from "@pinforth/shared";
import { env } from "../../config/env.js";
import { AppError, badRequest } from "../../lib/errors.js";
import { renderEmail, sendMailInBackground } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "./password.js";
import { consumeVerificationToken, issueVerificationToken } from "./verification-token.service.js";

const invalidLink = () =>
  new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or has expired");

// Always resolves the same way whether or not the account exists.
export async function requestPasswordReset({ email }: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) return;

  const token = await issueVerificationToken(user.id, "PASSWORD_RESET", env.PASSWORD_RESET_TTL_MINUTES);
  // The web reset page must send `Referrer-Policy: no-referrer` so the token
  // in this URL never leaks to third-party resources.
  const url = new URL("/reset-password", env.APP_URL);
  url.searchParams.set("token", token);

  sendMailInBackground({
    to: user.email,
    subject: "Reset your Pinforth password",
    ...renderEmail({
      greetingName: user.name,
      paragraphs: [
        "We received a request to reset the password for your Pinforth account.",
        `This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes and can be used once.`,
        "If you didn't ask for this, you can ignore this email — your password won't change.",
      ],
      action: { label: "Reset password", url: url.toString() },
    }),
  });
}

export async function resetPassword({ token, password }: ResetPasswordInput) {
  // Hash before the transaction so the slow part doesn't hold a DB connection.
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const userId = await consumeVerificationToken(tx, token, "PASSWORD_RESET");
    if (!userId) throw invalidLink();

    const current = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });

    if (password.trim().toLowerCase() === current.email) {
      throw badRequest("Password must not be your email address");
    }

    const now = new Date();

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Opening the emailed link proves the address belongs to them.
        emailVerifiedAt: current.emailVerifiedAt ?? now,
      },
      select: { email: true, name: true },
    });

    // Anyone signed in with the old password is signed out.
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    // Any other outstanding reset links stop working.
    await tx.verificationToken.updateMany({
      where: { userId, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: now },
    });

    return updated;
  });

  sendMailInBackground({
    to: user.email,
    subject: "Your Pinforth password was changed",
    ...renderEmail({
      greetingName: user.name,
      paragraphs: [
        "The password for your Pinforth account was just changed, and all devices were signed out.",
        "If this wasn't you, reset your password again straight away and contact your workspace administrator.",
      ],
    }),
  });
}
