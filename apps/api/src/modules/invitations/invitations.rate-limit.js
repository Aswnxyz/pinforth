import { clientIp, limiter } from "../auth/rate-limit.js";

const HOUR = 60 * 60 * 1000;

// Caps how many invite emails one organization can trigger.
export const createInvitationOrgLimiter = limiter({
  windowMs: HOUR,
  limit: 30,
  keyGenerator: (req) => `invite-org:${req.membership?.organizationId}`,
});

export const createInvitationUserLimiter = limiter({
  windowMs: HOUR,
  limit: 10,
  keyGenerator: (req) => `invite-user:${req.auth?.userId}`,
});

// Stops one inbox being spammed through resends.
export const resendInvitationLimiter = limiter({
  windowMs: HOUR,
  limit: 3,
  keyGenerator: (req) => `invite-resend:${req.params.invitationId}`,
});

export const previewInvitationLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: clientIp,
});

export const acceptInvitationLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: clientIp,
});
