import { organizationRoleSchema } from "@pinforth/shared";
import { Router } from "express";
import { z } from "zod";
import { getAuth } from "../../middleware/require-auth.js";
import { getMembership, requireMembershipRole } from "../../middleware/require-org-role.js";
import { changeMemberRole, listMembers, removeMember } from "./members.service.js";

const changeRoleSchema = z.object({ role: organizationRoleSchema });

// Mounted at /organizations/:orgId/members behind requireAuth + requireOrgRole(),
// so req.membership is the caller's own membership.
const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const members = await listMembers(getMembership(req).organizationId, getAuth(req).userId);

  res.status(200).json({ success: true, data: { members } });
});

// Only OWNERs change roles, so admins can't promote each other or themselves.
router.patch("/:memberId", requireMembershipRole("OWNER"), async (req, res) => {
  const { role } = changeRoleSchema.parse(req.body);
  const member = await changeMemberRole(
    getMembership(req).organizationId,
    req.params.memberId,
    role,
    getAuth(req).userId
  );

  res.status(200).json({ success: true, data: { member } });
});

// Removing someone else, or leaving when it's your own member id. The service
// applies the role rules, since they depend on who the target is.
router.delete("/:memberId", async (req, res) => {
  const data = await removeMember(getMembership(req).organizationId, req.params.memberId, getAuth(req).userId);

  res.status(200).json({ success: true, data, message: "Member removed" });
});

export default router;
