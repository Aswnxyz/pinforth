import { createOrganizationSchema, updateOrganizationSchema } from "@pinforth/shared";
import { Router } from "express";
import { getAuth, requireAuth } from "../../middleware/require-auth.js";
import { getMembership, requireOrgRole } from "../../middleware/require-org-role.js";
import {
  createOrganization,
  getOrganization,
  listMembers,
  listMyOrganizations,
  updateOrganization,
} from "./organizations.service.js";

const router = Router();

router.use(requireAuth);

router.post("/", async (req, res) => {
  const input = createOrganizationSchema.parse(req.body);
  const organization = await createOrganization(getAuth(req).userId, input);

  res.status(201).json({ success: true, data: { organization } });
});

router.get("/", async (req, res) => {
  const organizations = await listMyOrganizations(getAuth(req).userId);

  res.status(200).json({ success: true, data: { organizations } });
});

router.get("/:orgId", requireOrgRole(), async (req, res) => {
  const { organizationId, role } = getMembership(req);
  const organization = await getOrganization(organizationId, role);

  res.status(200).json({ success: true, data: { organization } });
});

router.patch("/:orgId", requireOrgRole("OWNER", "ADMIN"), async (req, res) => {
  const { organizationId, role } = getMembership(req);
  const input = updateOrganizationSchema.parse(req.body);
  const organization = await updateOrganization(organizationId, role, input);

  res.status(200).json({ success: true, data: { organization } });
});

router.get("/:orgId/members", requireOrgRole(), async (req, res) => {
  const members = await listMembers(getMembership(req).organizationId);

  res.status(200).json({ success: true, data: { members } });
});

export default router;
