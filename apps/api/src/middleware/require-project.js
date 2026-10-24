import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { projectSlugParam } from "../modules/projects/projects.schemas.js";
import { getMembership } from "./require-org-role.js";

// A project in another organization gets the same 404 as one that doesn't
// exist, so slugs can't be probed across tenants.
const projectNotFound = () => notFound("Project not found");

// Mount after requireOrgRole on routes with a :projectSlug param.
// Sets req.project = { id, organizationId, slug }.
export const requireProject = async (req, _res, next) => {
  const { organizationId } = getMembership(req);

  const parsed = projectSlugParam.safeParse(req.params.projectSlug);
  if (!parsed.success) throw projectNotFound();

  // Scoped by the caller's organization: the slug alone is never enough.
  const project = await prisma.project.findUnique({
    where: { organizationId_slug: { organizationId, slug: parsed.data } },
    select: { id: true, organizationId: true, slug: true },
  });

  if (!project) throw projectNotFound();

  req.project = project;
  next();
};

export function getProject(req) {
  if (!req.project) throw projectNotFound();
  return req.project;
}
