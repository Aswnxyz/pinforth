import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError, unauthorized } from "../../lib/errors.js";

const ISSUER = "pinforth-api";
const AUDIENCE = "pinforth-web";
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  // Login family: revocation is checked per family so a rotation doesn't
  // invalidate requests already in flight with the previous access token.
  familyId: string;
}

export async function signAccessToken({ userId, sessionId, familyId }: AccessTokenClaims) {
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

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
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
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
