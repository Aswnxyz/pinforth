import { z } from "zod";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const memberIdParam = z.uuid();

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
};

// Member: id, role, joinedAt, user { id, name, email }, isYou.
const toMember = (member, currentUserId) => ({
  id: member.id,
  role: member.role,
  joinedAt: member.createdAt.toISOString(),
  user: member.user,
  isYou: member.userId === currentUserId,
});

const memberNotFound = () => notFound("Member not found");

const lastOwner = () =>
  new AppError(409, "LAST_OWNER", "An organization needs at least one owner. Make someone else an owner first");

export async function listMembers(organizationId, currentUserId) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => toMember(member, currentUserId));
}

// Locks the organization's OWNER rows, then the target and actor rows, for the
// rest of the transaction. Two owners demoting each other at the same moment
// therefore run one after the other, and the second sees only one owner left.
// The actor's role is re-read here too: the one checked by the route may be
// stale if they were demoted while this request was in flight.
async function lockForOwnershipChange(tx, organizationId, memberId, actorUserId) {
  const owners = await tx.$queryRaw`
    SELECT id FROM "OrganizationMember"
    WHERE "organizationId" = ${organizationId}::uuid AND role = 'OWNER'
    FOR UPDATE
  `;

  const rows = await tx.$queryRaw`
    SELECT id, "userId", role FROM "OrganizationMember"
    WHERE "organizationId" = ${organizationId}::uuid
      AND (id = ${memberId}::uuid OR "userId" = ${actorUserId}::uuid)
    FOR UPDATE
  `;

  return {
    target: rows.find((row) => row.id === memberId),
    actorRole: rows.find((row) => row.userId === actorUserId)?.role ?? null,
    ownerCount: owners.length,
  };
}

function parseMemberId(memberId) {
  const parsed = memberIdParam.safeParse(memberId);
  if (!parsed.success) throw memberNotFound();
  return parsed.data;
}

// OWNER only (enforced by the route). Any role, including granting OWNER.
export async function changeMemberRole(organizationId, memberId, newRole, currentUserId) {
  const id = parseMemberId(memberId);

  return prisma.$transaction(async (tx) => {
    const { target, actorRole, ownerCount } = await lockForOwnershipChange(tx, organizationId, id, currentUserId);

    if (actorRole !== "OWNER") throw forbidden("Your role in this organization doesn't allow this");

    // Scoped by organization: a member id from another org is "not found".
    if (!target) throw memberNotFound();

    if (target.role === "OWNER" && newRole !== "OWNER" && ownerCount <= 1) throw lastOwner();

    const member = await tx.organizationMember.update({
      where: { id },
      data: { role: newRole },
      select: memberSelect,
    });

    return toMember(member, currentUserId);
  });
}

// Who may remove whom:
//   - anyone may remove themselves (leave)
//   - OWNER may remove anyone
//   - ADMIN may remove MEMBERs only
// and never the last OWNER.
export async function removeMember(organizationId, memberId, actorUserId) {
  const id = parseMemberId(memberId);

  await prisma.$transaction(async (tx) => {
    const { target, actorRole, ownerCount } = await lockForOwnershipChange(tx, organizationId, id, actorUserId);

    // Removed by someone else while this request was in flight.
    if (!actorRole) throw notFound("Organization not found");
    if (!target) throw memberNotFound();

    const isSelf = target.userId === actorUserId;

    if (!isSelf) {
      const allowed = actorRole === "OWNER" || (actorRole === "ADMIN" && target.role === "MEMBER");
      if (!allowed) throw forbidden("Your role in this organization doesn't allow removing this member");
    }

    if (target.role === "OWNER" && ownerCount <= 1) throw lastOwner();

    await tx.organizationMember.delete({ where: { id } });
  });

  return { memberId: id };
}
