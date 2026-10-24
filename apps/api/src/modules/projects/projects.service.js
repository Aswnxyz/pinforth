import { randomBytes } from "node:crypto";
import { slugify } from "@pinforth/shared";
import { Prisma } from "../../generated/prisma/index.js";
import { AppError, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { environmentIdParam, RESERVED_PROJECT_SLUGS } from "./projects.schemas.js";

const SLUG_ATTEMPTS = 4;

const projectSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

const environmentSelect = {
  id: true,
  name: true,
  slug: true,
  url: true,
  createdAt: true,
  updatedAt: true,
};

// ProjectSummary: id, name, slug, description, createdAt, updatedAt.
const toProjectSummary = (project) => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  description: project.description,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

// Environment: id, name, slug, url, createdAt, updatedAt.
const toEnvironment = (environment) => ({
  id: environment.id,
  name: environment.name,
  slug: environment.slug,
  url: environment.url,
  createdAt: environment.createdAt.toISOString(),
  updatedAt: environment.updatedAt.toISOString(),
});

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const randomSuffix = () => randomBytes(3).toString("hex");

const environmentNameTaken = () =>
  new AppError(409, "ENVIRONMENT_NAME_TAKEN", "An environment with this name already exists in this project");

const environmentNotFound = () => notFound("Environment not found");

// Tries the base slug first, then base-<random>. `insert` throws P2002 when
// the slug is taken. Reserved slugs are skipped straight to the suffixed form.
async function insertWithUniqueSlug(base, insert, { reserved = new Set() } = {}) {
  const candidates = [
    ...(reserved.has(base) ? [] : [base]),
    ...Array.from({ length: SLUG_ATTEMPTS }, () => `${base}-${randomSuffix()}`),
  ];

  for (const slug of candidates) {
    try {
      return await insert(slug);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new AppError(409, "CONFLICT", "Couldn't generate a unique URL slug, please try again");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(organizationId, input) {
  // Names like "!!!" produce no slug; fall back rather than reject the name.
  const base = slugify(input.name) || "project";

  const project = await insertWithUniqueSlug(
    base,
    (slug) =>
      prisma.project.create({
        data: {
          organizationId,
          name: input.name,
          slug,
          description: input.description ?? null,
        },
        select: projectSelect,
      }),
    { reserved: RESERVED_PROJECT_SLUGS }
  );

  return toProjectSummary(project);
}

// Newest first.
export async function listProjects(organizationId) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: projectSelect,
    orderBy: { createdAt: "desc" },
  });

  return projects.map(toProjectSummary);
}

// ProjectDetail: summary + environments, oldest first.
export async function getProjectDetail(projectId) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      ...projectSelect,
      environments: { select: environmentSelect, orderBy: { createdAt: "asc" } },
    },
  });

  return {
    ...toProjectSummary(project),
    environments: project.environments.map(toEnvironment),
  };
}

// Omitted fields are untouched; description null clears it. Slug never changes.
export async function updateProject(projectId, input) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: projectSelect,
  });

  return toProjectSummary(project);
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

// Names are unique per project, ignoring case ("Staging" and "staging" clash).
async function assertEnvironmentNameFree(projectId, name, exceptId) {
  const clash = await prisma.environment.findFirst({
    where: {
      projectId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });

  if (clash) throw environmentNameTaken();
}

export async function createEnvironment(projectId, input) {
  await assertEnvironmentNameFree(projectId, input.name);

  // The slug can still be taken by a renamed environment (slugs are immutable),
  // so collisions get a suffix rather than an error.
  const base = slugify(input.name) || "environment";

  const environment = await insertWithUniqueSlug(base, (slug) =>
    prisma.environment.create({
      data: { projectId, name: input.name, slug, url: input.url },
      select: environmentSelect,
    })
  );

  return toEnvironment(environment);
}

export async function updateEnvironment(projectId, environmentId, input) {
  const parsedId = environmentIdParam.safeParse(environmentId);
  if (!parsedId.success) throw environmentNotFound();

  // Scoped by project: an environment id from another project is "not found".
  const existing = await prisma.environment.findFirst({
    where: { id: parsedId.data, projectId },
    select: { id: true },
  });

  if (!existing) throw environmentNotFound();

  if (input.name !== undefined) {
    await assertEnvironmentNameFree(projectId, input.name, existing.id);
  }

  const environment = await prisma.environment.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
    },
    select: environmentSelect,
  });

  return toEnvironment(environment);
}
