import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { environmentIdParam } from "../modules/projects/projects.schemas.js";
import { getProject } from "./require-project.js";

// A malformed or foreign environment gets the same 404 as one that doesn't
// exist, so IDs can't be probed across projects or tenants.
const environmentNotFound = () => notFound("Environment not found");

// Mount after requireProject on routes with an :environmentId param.
// Sets req.environment = { id, projectId }.
export const requireEnvironment = async (req, _res, next) => {
  const project = getProject(req);

  const parsed = environmentIdParam.safeParse(req.params.environmentId);
  if (!parsed.success) throw environmentNotFound();

  // Scoped by the resolved project: the environment ID alone is never enough.
  const environment = await prisma.environment.findFirst({
    where: { id: parsed.data, projectId: project.id },
    select: { id: true, projectId: true },
  });

  if (!environment) throw environmentNotFound();

  req.environment = environment;
  next();
};

export function getEnvironment(req) {
  if (!req.environment) throw environmentNotFound();
  return req.environment;
}
