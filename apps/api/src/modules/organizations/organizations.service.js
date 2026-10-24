import { randomBytes } from "node:crypto";
import { organizationSlugSchema, slugify } from "@pinforth/shared";
import { Prisma } from "../../generated/prisma/index.js";
import { badRequest, conflict } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
};

// role is the caller's role in this organization: "OWNER" | "ADMIN" | "MEMBER".
const toOrganization = (org, role) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  role,
  createdAt: org.createdAt.toISOString(),
  updatedAt: org.updatedAt.toISOString(),
});

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function insertWithOwner(userId, name, slug) {
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

export async function createOrganization(userId, input) {
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

export async function listMyOrganizations(userId) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { role: true, organization: { select: organizationSelect } },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map(({ organization, role }) => toOrganization(organization, role));
}

export async function getOrganization(organizationId, role) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: organizationSelect,
  });

  return toOrganization(org, role);
}

export async function updateOrganization(organizationId, role, input) {
  // Slug isn't editable: it will appear in URLs and widget embed codes.
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { name: input.name },
    select: organizationSelect,
  });

  return toOrganization(org, role);
}
