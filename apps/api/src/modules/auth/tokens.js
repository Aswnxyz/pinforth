import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError, unauthorized } from "../../lib/errors.js";

const ISSUER = "pinforth-api";
const AUDIENCE = "pinforth-web";
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

// Claims: userId, sessionId, and familyId (the login family). Revocation is
// checked per family so a rotation doesn't invalidate requests already in
// flight with the previous access token.
export async function signAccessToken({ userId, sessionId, familyId }) {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_TTL_SECONDS * 1000);

  const token = await new SignJWT({ sid: sessionId, fid: familyId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  return { token, expiresAt };
}

// Returns { userId, sessionId, familyId } or throws a 401.
export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    const { sub, sid, fid } = payload;

    if (typeof sub !== "string" || typeof sid !== "string" || typeof fid !== "string") {
      throw unauthorized("Invalid access token");
    }

    return { userId: sub, sessionId: sid, familyId: fid };
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Distinct code so the web app knows to call /refresh rather than log out.
    if (error instanceof errors.JWTExpired) {
      throw new AppError(401, "ACCESS_TOKEN_EXPIRED", "Access token has expired");
    }

    throw unauthorized("Invalid access token");
  }
}

// Opaque refresh / verification tokens: 256 bits of randomness.
export const generateOpaqueToken = () => randomBytes(32).toString("base64url");

// Only this hash is stored, so a database leak doesn't expose usable tokens.
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
