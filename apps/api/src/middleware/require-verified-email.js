import { AppError, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

// Mount after requireAuth on actions that need a proven email address,
// such as inviting people or approving a release.
export const requireVerifiedEmail = async (req, _res, next) => {
  if (!req.auth) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { emailVerifiedAt: true },
  });

  if (!user) throw unauthorized();

  if (!user.emailVerifiedAt) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Please confirm your email address first");
  }

  next();
};
