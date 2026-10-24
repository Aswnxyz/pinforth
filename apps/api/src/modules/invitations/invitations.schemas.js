import { emailSchema } from "@pinforth/shared";
import { z } from "zod";

// Invites can't grant OWNER: ownership is given by an existing OWNER changing
// a member's role, never by a link that could be forwarded.
export const INVITABLE_ROLES = ["ADMIN", "MEMBER"];

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z
    .enum(INVITABLE_ROLES, {
      error: "Invite as ADMIN or MEMBER. An OWNER can promote people after they join",
    })
    .default("MEMBER"),
});

// Tokens are 43-char base64url; the bounds just reject junk early.
export const invitationTokenSchema = z.string().trim().min(16).max(256);

export const acceptInvitationSchema = z.object({
  token: invitationTokenSchema,
});

export const invitationIdParam = z.uuid();
