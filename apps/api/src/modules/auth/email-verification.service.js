import { env } from "../../config/env.js";
import { AppError, unauthorized } from "../../lib/errors.js";
import { renderEmail, sendMailInBackground } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { consumeVerificationToken, issueVerificationToken } from "./verification-token.service.js";

const invalidLink = () =>
  new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "This verification link is invalid or has expired");

// user: { id, email, name }
export async function sendVerificationEmail(user) {
  const token = await issueVerificationToken(user.id, "EMAIL_VERIFY", env.EMAIL_VERIFY_TTL_HOURS * 60);
  // Like the reset page, the web verify page must send `Referrer-Policy: no-referrer`.
  const url = new URL("/verify-email", env.APP_URL);
  url.searchParams.set("token", token);

  sendMailInBackground({
    to: user.email,
    subject: "Confirm your email for Pinforth",
    ...renderEmail({
      greetingName: user.name,
      paragraphs: [
        "Please confirm this is your email address. You'll need a confirmed email to invite your team and approve releases.",
        `This link expires in ${env.EMAIL_VERIFY_TTL_HOURS} hours.`,
        "If you didn't create a Pinforth account, you can ignore this email.",
      ],
      action: { label: "Confirm email", url: url.toString() },
    }),
  });
}

export async function verifyEmail({ token }) {
  return prisma.$transaction(async (tx) => {
    const userId = await consumeVerificationToken(tx, token, "EMAIL_VERIFY");
    if (!userId) throw invalidLink();

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });

    // Keep the original time if they were already verified (e.g. via a password reset).
    const emailVerifiedAt = user.emailVerifiedAt ?? new Date();

    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt } });
    await tx.verificationToken.updateMany({
      where: { userId, type: "EMAIL_VERIFY", usedAt: null },
      data: { usedAt: new Date() },
    });

    return { emailVerifiedAt: emailVerifiedAt.toISOString() };
  });
}

// Returns alreadyVerified instead of erroring: it's an expected outcome, not a failure.
export async function resendVerificationEmail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });

  if (!user) throw unauthorized();
  if (user.emailVerifiedAt) return { alreadyVerified: true };

  await sendVerificationEmail(user);
  return { alreadyVerified: false };
}
