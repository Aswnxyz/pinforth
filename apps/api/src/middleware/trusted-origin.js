import { env } from "../config/env.js";
import { forbidden } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF defence alongside SameSite cookies: browsers always send Origin on
// cross-site state-changing requests, so reject any that isn't ours.
// Requests without Origin come from non-browser clients (curl, server-to-server).
export const requireTrustedOrigin = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");

  if (origin && !env.WEB_ORIGIN.includes(origin)) {
    next(forbidden("Request origin is not allowed"));
    return;
  }

  next();
};
