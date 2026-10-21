import { Prisma } from "../../generated/prisma/index.js";
import { AppError, conflict, unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendVerificationEmail } from "./email-verification.service.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.js";
import { createSession } from "./session.service.js";

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

const userSelect = {
  id: true,
  email: true,
  name: true,
  emailVerifiedAt: true,
  createdAt: true,
};

// The only shape a user leaves the API in — never includes passwordHash.
export const toAuthUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
});

export async function signup(input, meta) {
  const passwordHash = await hashPassword(input.password);

  let user;

  try {
    user = await prisma.user.create({
      data: { email: input.email, name: input.name ?? null, passwordHash },
      select: userSelect,
    });
  } catch (error) {
    // Unique email. Checked via the constraint, not a prior lookup, so two
    // simultaneous signups can't both pass.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("An account with this email already exists");
    }
    throw error;
  }

  const tokens = await createSession(user.id, meta);
  await sendVerificationEmail(user);

  return { user: toAuthUser(user), tokens };
}

export async function login(input, meta) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });

  // Same error and same hashing cost whether the account is missing,
  // password-less (invited) or the password is wrong.
  if (!user?.passwordHash) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw invalidCredentials();
  }

  const tokens = await createSession(user.id, meta);

  return { user: toAuthUser(user), tokens };
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      memberships: {
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Token was valid but the account is gone.
  if (!user) throw unauthorized();

  return {
    user: toAuthUser(user),
    memberships: user.memberships,
  };
}
