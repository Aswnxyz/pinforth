import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "@pinforth/shared";
import { Router, type Request } from "express";
import { getAuth, requireAuth } from "../../middleware/require-auth.js";
import { getCurrentUser, login, signup } from "./auth.service.js";
import { clearAuthCookies, readRefreshToken, setAuthCookies } from "./cookies.js";
import { resendVerificationEmail, verifyEmail } from "./email-verification.service.js";
import { requestPasswordReset, resetPassword } from "./password-reset.service.js";
import {
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  refreshLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  signupLimiter,
  verifyEmailLimiter,
} from "./rate-limit.js";
import { revokeAllUserSessions, revokeFamilyByToken, rotateSession, type ClientMeta } from "./session.service.js";

const router = Router();

const clientMeta = (req: Request): ClientMeta => ({
  userAgent: req.get("user-agent"),
  ipAddress: req.ip,
});

router.post("/signup", signupLimiter, async (req, res) => {
  const input = signupSchema.parse(req.body);
  const { user, tokens } = await signup(input, clientMeta(req));

  setAuthCookies(res, tokens);
  res.status(201).json({
    success: true,
    data: { user, accessTokenExpiresAt: tokens.accessExpiresAt.toISOString() },
  });
});

router.post("/login", loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await login(input, clientMeta(req));

  setAuthCookies(res, tokens);
  res.status(200).json({
    success: true,
    data: { user, accessTokenExpiresAt: tokens.accessExpiresAt.toISOString() },
  });
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  const refreshToken = readRefreshToken(req);

  if (!refreshToken) {
    clearAuthCookies(res);
    res.status(401).json({
      success: false,
      code: "INVALID_REFRESH_TOKEN",
      message: "Session is invalid or has expired",
    });
    return;
  }

  try {
    const tokens = await rotateSession(refreshToken, clientMeta(req));

    setAuthCookies(res, tokens);
    res.status(200).json({
      success: true,
      data: { accessTokenExpiresAt: tokens.accessExpiresAt.toISOString() },
    });
  } catch (error) {
    // Don't leave a dead refresh cookie behind for the browser to keep sending.
    clearAuthCookies(res);
    throw error;
  }
});

// Works without a valid access token so an expired session can still log out.
router.post("/logout", async (req, res) => {
  const refreshToken = readRefreshToken(req);

  if (refreshToken) await revokeFamilyByToken(refreshToken);

  clearAuthCookies(res);
  res.status(200).json({ success: true, message: "Signed out" });
});

router.post("/logout-all", requireAuth, async (req, res) => {
  await revokeAllUserSessions(getAuth(req).userId);

  clearAuthCookies(res);
  res.status(200).json({ success: true, message: "Signed out of all devices" });
});

// Same response whether or not the email has an account.
router.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordEmailLimiter, async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);

  await requestPasswordReset(input);

  res.status(200).json({
    success: true,
    message: "If an account exists for that email, a reset link is on its way.",
  });
});

// Doesn't sign the user in: after a reset they log in with the new password.
router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);

  await resetPassword(input);

  clearAuthCookies(res);
  res.status(200).json({ success: true, message: "Password updated. Please sign in." });
});

// No login needed: the link is often opened on a different device.
router.post("/verify-email", verifyEmailLimiter, async (req, res) => {
  const input = verifyEmailSchema.parse(req.body);
  const data = await verifyEmail(input);

  res.status(200).json({ success: true, data, message: "Email confirmed" });
});

router.post("/resend-verification", requireAuth, resendVerificationLimiter, async (req, res) => {
  const data = await resendVerificationEmail(getAuth(req).userId);

  res.status(200).json({
    success: true,
    data,
    message: data.alreadyVerified ? "Your email is already confirmed" : "Verification email sent",
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const data = await getCurrentUser(getAuth(req).userId);

  res.status(200).json({ success: true, data });
});

export default router;
