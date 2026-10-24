import { Router } from "express";
import { getMembership, requireMembershipRole } from "../../middleware/require-org-role.js";
import { getProject, requireProject } from "../../middleware/require-project.js";
import {
  createEnvironmentSchema,
  createProjectSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
} from "./projects.schemas.js";
import {
  createEnvironment,
  createProject,
  getProjectDetail,
  listProjects,
  updateEnvironment,
  updateProject,
} from "./projects.service.js";

// Mounted at /organizations/:orgId/projects behind requireAuth + requireOrgRole(),
// so every route here already has req.membership. Members can read; only
// OWNER and ADMIN can write.
const router = Router({ mergeParams: true });

const canManage = requireMembershipRole("OWNER", "ADMIN");

router.post("/", canManage, async (req, res) => {
  const input = createProjectSchema.parse(req.body);
  const project = await createProject(getMembership(req).organizationId, input);

  res.status(201).json({ success: true, data: { project } });
});

router.get("/", async (req, res) => {
  const projects = await listProjects(getMembership(req).organizationId);

  res.status(200).json({ success: true, data: { projects } });
});

router.get("/:projectSlug", requireProject, async (req, res) => {
  const project = await getProjectDetail(getProject(req).id);

  res.status(200).json({ success: true, data: { project } });
});

router.patch("/:projectSlug", requireProject, canManage, async (req, res) => {
  const input = updateProjectSchema.parse(req.body);
  const project = await updateProject(getProject(req).id, input);

  res.status(200).json({ success: true, data: { project } });
});

router.post("/:projectSlug/environments", requireProject, canManage, async (req, res) => {
  const input = createEnvironmentSchema.parse(req.body);
  const environment = await createEnvironment(getProject(req).id, input);

  res.status(201).json({ success: true, data: { environment } });
});

router.patch("/:projectSlug/environments/:environmentId", requireProject, canManage, async (req, res) => {
  const input = updateEnvironmentSchema.parse(req.body);
  const environment = await updateEnvironment(getProject(req).id, req.params.environmentId, input);

  res.status(200).json({ success: true, data: { environment } });
});

export default router;
