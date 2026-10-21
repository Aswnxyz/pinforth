import { env } from "../../config/env.js";

export const ACCESS_COOKIE = "pf_access";
export const REFRESH_COOKIE = "pf_refresh";

// Refresh cookie is only sent to auth routes, never to the rest of the API.
const ACCESS_PATH = "/api";
const REFRESH_PATH = "/api/v1/auth";

const baseOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

// tokens: { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }
export function setAuthCookies(res, tokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: ACCESS_PATH,
    expires: tokens.accessExpiresAt,
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    path: REFRESH_PATH,
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_PATH });
}

export function readAccessToken(req) {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookie === "string" && cookie) return cookie;

  // Bearer is accepted for non-browser clients (scripts, future integrations).
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || undefined;

  return undefined;
}

export function readRefreshToken(req) {
  const cookie = req.cookies?.[REFRESH_COOKIE];
  return typeof cookie === "string" && cookie ? cookie : undefined;
}
