import { unauthorized } from "../lib/errors.js";
import { readAccessToken } from "../modules/auth/cookies.js";
import { isFamilyActive } from "../modules/auth/session.service.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

// Sets req.auth = { userId, sessionId, familyId } for the handlers after it.
export const requireAuth = async (req, _res, next) => {
  const token = readAccessToken(req);

  if (!token) throw unauthorized();

  const claims = await verifyAccessToken(token);

  // One indexed lookup per request buys immediate logout / revoke.
  if (!(await isFamilyActive(claims.familyId, claims.userId))) {
    throw unauthorized("Session has ended, please sign in again");
  }

  req.auth = claims;
  next();
};

// For handlers mounted behind requireAuth.
export function getAuth(req) {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
