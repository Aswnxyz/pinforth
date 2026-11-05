import { Router, json } from "express";
import { createWidgetIssueSchema, widgetExchangeSchema } from "@pinforth/shared";
import { notFound, unauthorized } from "../../lib/errors.js";
import { clientIp, limiter } from "../auth/rate-limit.js";
import { createWidgetIssue, exchangeWidgetHandoff } from "./widget.service.js";

const router = Router();

// Widget-specific CORS preflight and headers
router.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Idempotency-Key"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
    return;
  }

  next();
});

// Enforce strict 64KB payload limit for widget submissions
router.use(json({ limit: "64kb" }));

const widgetExchangeLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: clientIp,
});

const widgetIssueLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: clientIp,
});

function getBearerToken(req) {
  const authHeader = req.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

router.post("/sessions/exchange", widgetExchangeLimiter, async (req, res) => {
  const input = widgetExchangeSchema.parse(req.body);
  const origin = req.get("origin");

  const result = await exchangeWidgetHandoff(input.handoffCode, origin, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  const { allowedOrigin: _ignored, ...data } = result;

  res.status(200).json({ success: true, data });
});

router.post("/issues", widgetIssueLimiter, async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    throw unauthorized("Bearer session token is required");
  }

  const input = createWidgetIssueSchema.parse(req.body);
  const origin = req.get("origin");

  const result = await createWidgetIssue(token, origin, input);

  const statusCode = result.isDuplicate ? 200 : 201;

  res.status(statusCode).json({
    success: true,
    data: { issue: result.issue },
  });
});

router.use((_req, _res, next) => {
  next(notFound("Widget route not found"));
});

// Router-level error middleware to handle widget error responses and origin rejection
router.use((err, req, res, next) => {
  // If the request was rejected due to an unauthorized staging origin,
  // ensure Access-Control-Allow-Origin is stripped so the browser rejects cross-origin access.
  if (err?.status === 403 && err?.message === "Origin not allowed for this environment") {
    res.removeHeader("Access-Control-Allow-Origin");
  }
  next(err);
});

export default router;
