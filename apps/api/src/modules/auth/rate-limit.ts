import type { Request } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { env } from "../../config/env.js";
import { tooManyRequests } from "../../lib/errors.js";

// In-memory store: fine for one API instance. Swap in a Redis store before scaling out.
const limiter = (options: Partial<Options>) =>
  rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !env.AUTH_RATE_LIMIT,
    handler: (_req, _res, next) => next(tooManyRequests()),
    ...options,
  });

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

const emailFromBody = (req: Request) =>
  typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

// Failed logins per account+IP: slows password guessing on one account.
export const loginAccountLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${clientIp(req)}:${emailFromBody(req)}`,
});

// All login attempts per IP: slows spraying many accounts from one address.
export const loginIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  keyGenerator: clientIp,
});

export const signupLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: clientIp,
});

// Stops reset emails being used to spam one inbox.
export const forgotPasswordEmailLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => `forgot:${emailFromBody(req)}`,
});

export const forgotPasswordIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: clientIp,
});

// Tokens are unguessable, but there's no reason to allow fast retries.
export const resetPasswordLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: clientIp,
});

// Runs after requireAuth, so it's keyed per account.
export const resendVerificationLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => `resend:${req.auth?.userId ?? clientIp(req)}`,
});

export const verifyEmailLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: clientIp,
});

export const refreshLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: clientIp,
});
