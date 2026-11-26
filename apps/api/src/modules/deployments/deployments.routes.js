import { Router } from "express";
import { notFound } from "../../lib/errors.js";
import { getAuth } from "../../middleware/require-auth.js";
import { getEnvironment, requireEnvironment } from "../../middleware/require-environment.js";
import { requireVerifiedEmail } from "../../middleware/require-verified-email.js";
import {
  createDeploymentSchema,
  deploymentIdParam,
  listDeploymentsQuerySchema,
} from "./deployments.schemas.js";
import { createDeployment, getDeployment, listDeployments } from "./deployments.service.js";

// Mounted under
// /organizations/:orgId/projects/:projectSlug/environments/:environmentId/deployments
// with requireAuth, requireOrgRole() and requireProject already applied.
// requireEnvironment runs below. Members can read; every member role can
// record a deployment.
const router = Router({ mergeParams: true });

router.use(requireEnvironment);

router.post("/", requireVerifiedEmail, async (req, res) => {
  const input = createDeploymentSchema.parse(req.body);
  const deployment = await createDeployment(getEnvironment(req).id, getAuth(req).userId, input);

  res.status(201).json({ success: true, data: { deployment } });
});

router.get("/", async (req, res) => {
  const query = listDeploymentsQuerySchema.parse(req.query);
  const result = await listDeployments(getEnvironment(req).id, query);

  res.status(200).json({ success: true, data: result });
});

router.get("/:deploymentId", async (req, res) => {
  const parsed = deploymentIdParam.safeParse(req.params.deploymentId);
  if (!parsed.success) throw notFound("Deployment not found");

  const deployment = await getDeployment(getEnvironment(req).id, parsed.data);

  res.status(200).json({ success: true, data: { deployment } });
});

export default router;
