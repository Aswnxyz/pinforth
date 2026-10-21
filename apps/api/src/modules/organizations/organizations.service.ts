import { randomBytes } from "node:crypto";
import {
  organizationSlugSchema,
  slugify,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from "@pinforth/shared";
import { Prisma, type OrganizationRole } from "../../generated/prisma/client.js";
import { badRequest, conflict } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedOrganization = Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;

const toOrganization = (org: SelectedOrganization, role: OrganizationRole) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  role,
  createdAt: org.createdAt.toISOString(),
  updatedAt: org.updatedAt.toISOString(),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function insertWithOwner(userId: string, name: string, slug: string) {
  // Organization and its first OWNER are created together or not at all.
  return prisma.organization.create({
    data: {
      name,
      slug,
      members: { create: { userId, role: "OWNER" } },
    },
    select: organizationSelect,
  });
}

export async function createOrganization(userId: string, input: CreateOrganizationInput) {
  if (input.slug) {
    try {
      return toOrganization(await insertWithOwner(userId, input.name, input.slug), "OWNER");
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("That URL slug is already taken");
      throw error;
    }
  }

  const derived = organizationSlugSchema.safeParse(slugify(input.name));
  if (!derived.success) {
    throw badRequest("Couldn't create a URL slug from that name, please choose one", {
      field: "slug",
    });
  }

  // A derived slug that's taken gets a short random suffix rather than an error.
  const candidates = [derived.data, ...Array.from({ length: 3 }, () => `${derived.data}-${randomBytes(3).toString("hex")}`)];

  for (const slug of candidates) {
    try {
      return toOrganization(await insertWithOwner(userId, input.name, slug), "OWNER");
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw conflict("Couldn't find a free URL slug, please choose one");
}

export async function listMyOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { role: true, organization: { select: organizationSelect } },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map(({ organization, role }) => toOrganization(organization, role));
}

export async function getOrganization(organizationId: string, role: OrganizationRole) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: organizationSelect,
  });

  return toOrganization(org, role);
}

export async function updateOrganization(
  organizationId: string,
  role: OrganizationRole,
  input: UpdateOrganizationInput
) {
  // Slug isn't editable: it will appear in URLs and widget embed codes.
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { name: input.name },
    select: organizationSelect,
  });

  return toOrganization(org, role);
}

export async function listMembers(organizationId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => ({
    id: member.id,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    user: member.user,
  }));
}
