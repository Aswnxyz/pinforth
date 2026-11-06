import { Router } from "express";
import { guestExchangeSchema } from "@pinforth/shared";
import { clientIp, limiter } from "../auth/rate-limit.js";
import { exchangeGuestToken } from "./guest.service.js";

const router = Router();

const guestExchangeLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: clientIp,
});

router.post("/reviews/exchange", guestExchangeLimiter, async (req, res) => {
  const input = guestExchangeSchema.parse(req.body);

  const result = await exchangeGuestToken(input.token);

  res.status(200).json({ success: true, data: result });
});

export default router;
