import type { Request, RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
import { readAccessToken } from "../modules/auth/cookies.js";
import { isFamilyActive } from "../modules/auth/session.service.js";
import { verifyAccessToken, type AccessTokenClaims } from "../modules/auth/tokens.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
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
export function getAuth(req: Request): AccessTokenClaims {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
