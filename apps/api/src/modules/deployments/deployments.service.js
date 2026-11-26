import { z } from "zod";
import { Prisma } from "../../generated/prisma/index.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const deploymentSelect = {
  id: true,
  environmentId: true,
  label: true,
  commitSha: true,
  url: true,
  notes: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
};

const uuidSchema = z.uuid();

const toDeployment = (deployment) => ({
  id: deployment.id,
  environmentId: deployment.environmentId,
  label: deployment.label,
  commitSha: deployment.commitSha,
  url: deployment.url,
  notes: deployment.notes,
  createdBy: deployment.createdBy ?? null,
  createdAt: deployment.createdAt.toISOString(),
});

const isUniqueViolation = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const deploymentLabelTaken = () =>
  new AppError(
    409,
    "DEPLOYMENT_LABEL_TAKEN",
    "A deployment with this label already exists in this environment"
  );

// The environment ownership check happens in requireEnvironment. The insert
// itself is the only source of truth for label uniqueness: checking first
// would still race with a concurrent create.
export async function createDeployment(environmentId, createdById, input) {
  try {
    const deployment = await prisma.deployment.create({
      data: {
        environmentId,
        label: input.label,
        commitSha: input.commitSha ?? null,
        url: input.url ?? null,
        notes: input.notes ?? null,
        createdById,
      },
      select: deploymentSelect,
    });

    return toDeployment(deployment);
  } catch (error) {
    if (isUniqueViolation(error)) throw deploymentLabelTaken();
    throw error;
  }
}

const encodeCursor = (createdAt, id) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

export function decodeDeploymentCursor(rawCursor) {
  if (!/^[A-Za-z0-9_-]+$/.test(rawCursor)) {
    throw badRequest("Invalid cursor");
  }

  const [createdAtRaw, id, ...rest] = Buffer.from(rawCursor, "base64url")
    .toString("utf8")
    .split("|");
  const createdAt = new Date(createdAtRaw);

  // Only accept the canonical ISO form this service emits.
  if (
    rest.length > 0 ||
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== createdAtRaw ||
    !uuidSchema.safeParse(id).success
  ) {
    throw badRequest("Invalid cursor");
  }

  return { createdAt, id };
}

// Newest first, with id as the deterministic tie-breaker for equal timestamps.
const buildCursorWhere = (cursor) => {
  if (!cursor) return {};

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ],
  };
};

export async function listDeployments(environmentId, query) {
  const limit = query.limit;
  const cursor = query.cursor ? decodeDeploymentCursor(query.cursor) : null;
  const take = limit + 1;

  const deployments = await prisma.deployment.findMany({
    where: { environmentId, ...buildCursorWhere(cursor) },
    select: deploymentSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });

  const hasMore = deployments.length > limit;
  const page = hasMore ? deployments.slice(0, limit) : deployments;
  const last = page.at(-1);

  return {
    deployments: page.map(toDeployment),
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function getDeployment(environmentId, deploymentId) {
  const parsed = z.uuid().safeParse(deploymentId);
  if (!parsed.success) throw notFound("Deployment not found");

  const deployment = await prisma.deployment.findFirst({
    where: { id: parsed.data, environmentId },
    select: deploymentSelect,
  });

  if (!deployment) throw notFound("Deployment not found");

  return toDeployment(deployment);
}
