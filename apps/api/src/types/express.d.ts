import type { AccessTokenClaims } from "../modules/auth/tokens.js";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth.
      auth?: AccessTokenClaims;
    }
  }
}

export {};
