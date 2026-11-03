import type { OrganizationRole } from "@pinforth/shared";
import { apiFetch, type ApiResult } from "@/lib/auth/api";

export type InvitationRole = "ADMIN" | "MEMBER";

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invitedBy: {
    id: string;
    name: string;
  } | null;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  organization: {
    name: string;
    slug: string;
  };
  email: string;
  role: InvitationRole;
  invitedBy: {
    name: string;
  } | null;
  expiresAt: string;
}

export interface AcceptedInvitation {
  organization: {
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
  };
}

const organizationInvitationsPath = (orgId: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/invitations`;

// Get all pending and expired invitations.
export function listInvitations(
  orgId: string,
): Promise<ApiResult<{ invitations: OrganizationInvitation[] }>> {
  return apiFetch(organizationInvitationsPath(orgId));
}

// Invite a new organization member.
export function createInvitation(
  orgId: string,
  email: string,
  role: InvitationRole,
): Promise<ApiResult<{ invitation: OrganizationInvitation }>> {
  return apiFetch(organizationInvitationsPath(orgId), {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

// Resend an invitation with a fresh token.
export function resendInvitation(
  orgId: string,
  invitationId: string,
): Promise<ApiResult<{ invitation: OrganizationInvitation }>> {
  return apiFetch(
    `${organizationInvitationsPath(orgId)}/${encodeURIComponent(invitationId)}/resend`,
    { method: "POST" },
  );
}

// Revoke an existing invitation.
export function revokeInvitation(
  orgId: string,
  invitationId: string,
): Promise<ApiResult<{ invitation: OrganizationInvitation }>> {
  return apiFetch(
    `${organizationInvitationsPath(orgId)}/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

// Public invitation preview.
export function previewInvitation(
  token: string,
): Promise<ApiResult<{ invitation: InvitationPreview }>> {
  return apiFetch(`/api/v1/invitations/${encodeURIComponent(token)}`, {
    method: "GET",
    retryOn401: false,
  });
}

// Accept an invitation as the signed-in user.
export function acceptInvitation(
  token: string,
): Promise<ApiResult<AcceptedInvitation>> {
  return apiFetch("/api/v1/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
