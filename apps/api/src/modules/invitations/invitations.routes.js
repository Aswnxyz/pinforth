import { Router } from "express";
import { getAuth, requireAuth } from "../../middleware/require-auth.js";
import { getMembership, requireOrgRole } from "../../middleware/require-org-role.js";
import { requireVerifiedEmail } from "../../middleware/require-verified-email.js";
import {
  acceptInvitationLimiter,
  createInvitationOrgLimiter,
  createInvitationUserLimiter,
  previewInvitationLimiter,
  resendInvitationLimiter,
} from "./invitations.rate-limit.js";
import { acceptInvitationSchema, createInvitationSchema, invitationTokenSchema } from "./invitations.schemas.js";
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  previewInvitation,
  resendInvitation,
  revokeInvitation,
} from "./invitations.service.js";

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/invitations — OWNER and ADMIN only
// ---------------------------------------------------------------------------

export const organizationInvitationRoutes = Router({ mergeParams: true });

organizationInvitationRoutes.use(requireAuth, requireOrgRole("OWNER", "ADMIN"));

// The inviter needs a verified email, so throwaway accounts can't send invite spam.
organizationInvitationRoutes.post(
  "/",
  requireVerifiedEmail,
  createInvitationUserLimiter,
  createInvitationOrgLimiter,
  async (req, res) => {
    const input = createInvitationSchema.parse(req.body);
    const invitation = await createInvitation(getMembership(req).organizationId, getAuth(req).userId, input);

    res.status(201).json({ success: true, data: { invitation } });
  }
);

organizationInvitationRoutes.get("/", async (req, res) => {
  const invitations = await listInvitations(getMembership(req).organizationId);

  res.status(200).json({ success: true, data: { invitations } });
});

organizationInvitationRoutes.post("/:invitationId/resend", resendInvitationLimiter, async (req, res) => {
  const invitation = await resendInvitation(getMembership(req).organizationId, req.params.invitationId);

  res.status(200).json({ success: true, data: { invitation } });
});

organizationInvitationRoutes.delete("/:invitationId", async (req, res) => {
  const invitation = await revokeInvitation(getMembership(req).organizationId, req.params.invitationId);

  res.status(200).json({ success: true, data: { invitation } });
});

// ---------------------------------------------------------------------------
// /api/v1/invitations — for the person holding the invite link
// ---------------------------------------------------------------------------

export const invitationLinkRoutes = Router();

// Public: the invitee may not have an account yet.
invitationLinkRoutes.get("/:token", previewInvitationLimiter, async (req, res) => {
  const parsed = invitationTokenSchema.safeParse(req.params.token);
  if (!parsed.success) {
    res.status(404).json({
      success: false,
      code: "INVITATION_INVALID",
      message: "This invitation link is invalid or has already been used",
    });
    return;
  }

  const invitation = await previewInvitation(parsed.data);

  res.status(200).json({ success: true, data: { invitation } });
});

invitationLinkRoutes.post("/accept", acceptInvitationLimiter, requireAuth, async (req, res) => {
  const { token } = acceptInvitationSchema.parse(req.body);
  const data = await acceptInvitation(getAuth(req).userId, token);

  res.status(200).json({ success: true, data });
});
