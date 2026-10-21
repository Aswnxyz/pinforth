import type { OrganizationRole } from "../generated/prisma/client.js";
import type { AccessTokenClaims } from "../modules/auth/tokens.js";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth.
      auth?: AccessTokenClaims;
      // Set by requireOrgRole: the caller's membership in :orgId.
      membership?: { id: string; organizationId: string; role: OrganizationRole };
    }
  }
}

export {};
