import { env } from "../../config/env.js";
import { AppError, notFound } from "../../lib/errors.js";
import { renderEmail, sendMailInBackground } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import { invitationIdParam } from "./invitations.schemas.js";

const ROLE_LABELS = { ADMIN: "an admin", MEMBER: "a member" };

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
};

const expiry = () => new Date(Date.now() + env.INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

export const invitationStatus = (invitation) => {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
};

// Invitation (admin view): id, email, role, status, invitedBy, expiresAt, createdAt.
const toInvitation = (invitation) => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  status: invitationStatus(invitation),
  invitedBy: invitation.invitedBy ? { id: invitation.invitedBy.id, name: invitation.invitedBy.name } : null,
  expiresAt: invitation.expiresAt.toISOString(),
  createdAt: invitation.createdAt.toISOString(),
});

const invitationNotFound = () => notFound("Invitation not found");

const invitationInvalid = () =>
  new AppError(404, "INVITATION_INVALID", "This invitation link is invalid or has already been used");

const invitationExpired = () =>
  new AppError(410, "INVITATION_EXPIRED", "This invitation has expired. Ask for a new one");

function sendInvitationEmail({ to, token, organizationName, inviterName, role }) {
  // The web invite page must send `Referrer-Policy: no-referrer`.
  const url = new URL("/invite", env.APP_URL);
  url.searchParams.set("token", token);

  const inviter = inviterName ?? "A teammate";

  sendMailInBackground({
    to,
    subject: `${inviter} invited you to join ${organizationName} on Pinforth`,
    ...renderEmail({
      paragraphs: [
        `${inviter} invited you to join ${organizationName} on Pinforth as ${ROLE_LABELS[role]}.`,
        `This invitation expires in ${env.INVITATION_TTL_DAYS} days. Sign in or create an account with this email address to accept it.`,
        "If you weren't expecting this, you can ignore this email.",
      ],
      action: { label: "Accept invitation", url: url.toString() },
    }),
  });
}

// ---------------------------------------------------------------------------
// Organization-side (OWNER / ADMIN)
// ---------------------------------------------------------------------------

export async function createInvitation(organizationId, inviterId, input) {
  const token = generateOpaqueToken();

  const result = await prisma.$transaction(async (tx) => {
    // Serialises invites for the same org + email, so two simultaneous requests
    // can't both create a pending invite.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${input.email}`}))`;

    const existingMember = await tx.organizationMember.findFirst({
      where: { organizationId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) {
      throw new AppError(409, "ALREADY_MEMBER", "This person is already a member of the organization");
    }

    const pending = await tx.invitation.findFirst({
      where: { organizationId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) {
      throw new AppError(409, "INVITATION_PENDING", "An invitation is already pending for this email. Resend it instead", {
        invitationId: pending.id,
      });
    }

    const invitation = await tx.invitation.create({
      data: {
        organizationId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: inviterId,
        expiresAt: expiry(),
      },
      select: { ...invitationSelect, organization: { select: { name: true } } },
    });

    return invitation;
  });

  sendInvitationEmail({
    to: result.email,
    token,
    organizationName: result.organization.name,
    inviterName: result.invitedBy?.name,
    role: result.role,
  });

  return toInvitation(result);
}

// Open invites (pending or expired), newest first. Accepted and revoked ones are history.
export async function listInvitations(organizationId) {
  const invitations = await prisma.invitation.findMany({
    where: { organizationId, acceptedAt: null, revokedAt: null },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
  });

  return invitations.map(toInvitation);
}

// Scoped by organization: an id from another org is "not found".
async function findOpenInvitation(organizationId, invitationId) {
  const parsed = invitationIdParam.safeParse(invitationId);
  if (!parsed.success) throw invitationNotFound();

  const invitation = await prisma.invitation.findFirst({
    where: { id: parsed.data, organizationId, acceptedAt: null, revokedAt: null },
    select: { id: true },
  });

  if (!invitation) throw invitationNotFound();
  return invitation;
}

// New token and expiry: the previous link stops working. Also revives an expired invite.
export async function resendInvitation(organizationId, invitationId) {
  const { id } = await findOpenInvitation(organizationId, invitationId);
  const token = generateOpaqueToken();

  const invitation = await prisma.invitation.update({
    where: { id },
    data: { tokenHash: hashToken(token), expiresAt: expiry() },
    select: { ...invitationSelect, organization: { select: { name: true } } },
  });

  sendInvitationEmail({
    to: invitation.email,
    token,
    organizationName: invitation.organization.name,
    inviterName: invitation.invitedBy?.name,
    role: invitation.role,
  });

  return toInvitation(invitation);
}

// Soft revoke: the row stays as history, the link stops working at once.
export async function revokeInvitation(organizationId, invitationId) {
  const { id } = await findOpenInvitation(organizationId, invitationId);

  const revoked = await prisma.invitation.updateMany({
    where: { id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Accepted or revoked by someone else in the meantime.
  if (revoked.count === 0) throw invitationNotFound();

  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id }, select: invitationSelect });
  return toInvitation(invitation);
}

// ---------------------------------------------------------------------------
// Invitee-side (link holder)
// ---------------------------------------------------------------------------

function assertUsable(invitation) {
  if (!invitation || invitation.acceptedAt || invitation.revokedAt) throw invitationInvalid();
  if (invitation.expiresAt.getTime() <= Date.now()) throw invitationExpired();
}

// InvitationPreview: just enough for the invite page. No member list, no ids.
export async function previewInvitation(token) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true, slug: true } },
      invitedBy: { select: { name: true } },
    },
  });

  assertUsable(invitation);

  return {
    organization: { name: invitation.organization.name, slug: invitation.organization.slug },
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy ? { name: invitation.invitedBy.name } : null,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

// Joins the organization. Safe to call twice: a repeat (or a race with itself)
// returns the same organization without creating a second membership.
export async function acceptInvitation(userId, token) {
  const tokenHash = hashToken(token);

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        acceptedById: true,
        revokedAt: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });

    const alreadyAcceptedByMe = invitation?.acceptedAt && invitation.acceptedById === userId;

    if (!alreadyAcceptedByMe) {
      assertUsable(invitation);

      // A forwarded link can't be used by someone else.
      if (user.email !== invitation.email) {
        throw new AppError(
          403,
          "INVITATION_EMAIL_MISMATCH",
          `This invitation was sent to ${invitation.email}. Sign in with that email to accept it`
        );
      }

      // Conditional claim: of two simultaneous accepts, only one updates the row.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date(), acceptedById: userId },
      });

      if (claimed.count === 0) {
        const fresh = await tx.invitation.findUnique({ where: { id: invitation.id }, select: { acceptedById: true } });
        if (fresh?.acceptedById !== userId) throw invitationInvalid();
      }
    }

    const { organizationId } = invitation;

    // ON CONFLICT DO NOTHING: an existing membership (and its role) is kept.
    await tx.organizationMember.createMany({
      data: [{ organizationId, userId, role: invitation.role }],
      skipDuplicates: true,
    });

    // Opening the emailed link proves the address belongs to them.
    if (!user.emailVerifiedAt) {
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    }

    const membership = await tx.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });

    return {
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
        role: membership.role,
      },
    };
  });
}
