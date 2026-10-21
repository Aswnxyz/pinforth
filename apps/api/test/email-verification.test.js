import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { testOutbox, waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { requireAuth } from "../src/middleware/require-auth.js";
import { requireVerifiedEmail } from "../src/middleware/require-verified-email.js";
import { hashToken } from "../src/modules/auth/tokens.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

const post = (path, body = {}, access) => {
  const req = request(app).post(`/api/v1/auth/${path}`).set("Origin", WEB_ORIGIN);
  return (access ? req.set("Cookie", `pf_access=${access}`) : req).send(body);
};

const verificationTokenFrom = (index = -1) => {
  const mail = testOutbox.at(index);
  const match = mail?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No verification link in that email");
  return match[1];
};

async function signedUp() {
  const res = await post("signup", credentials());
  await waitForPendingMail();
  return { access: cookieValue(res, "pf_access"), userId: res.body.data.user.id };
}

const emailVerifiedAt = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).emailVerifiedAt;

beforeEach(async () => {
  await resetDatabase();
  testOutbox.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("verification email on signup", () => {
  it("sends a confirmation link and leaves the account unverified", async () => {
    await signedUp();

    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].to).toBe("owner@example.com");
    expect(testOutbox[0].subject).toMatch(/confirm your email/i);
    expect(testOutbox[0].text).toContain("http://localhost:3000/verify-email?token=");
    expect(await emailVerifiedAt()).toBeNull();

    const stored = await prisma.verificationToken.findFirstOrThrow({ where: { type: "EMAIL_VERIFY" } });
    expect(stored.tokenHash).toBe(hashToken(verificationTokenFrom()));
  });
});

describe("POST /auth/verify-email", () => {
  it("confirms the email without needing to be signed in", async () => {
    await signedUp();

    const res = await post("verify-email", { token: verificationTokenFrom() });

    expect(res.status).toBe(200);
    expect(res.body.data.emailVerifiedAt).toEqual(expect.any(String));
    expect(await emailVerifiedAt()).not.toBeNull();
  });

  it("shows up in /me", async () => {
    const { access } = await signedUp();
    await post("verify-email", { token: verificationTokenFrom() });

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", `pf_access=${access}`);

    expect(me.body.data.user.emailVerifiedAt).toEqual(expect.any(String));
  });

  it("refuses to reuse a link", async () => {
    await signedUp();
    const token = verificationTokenFrom();
    await post("verify-email", { token });

    const again = await post("verify-email", { token });

    expect(again.status).toBe(400);
    expect(again.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("rejects an expired link", async () => {
    await signedUp();
    await prisma.verificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await post("verify-email", { token: verificationTokenFrom() });

    expect(res.status).toBe(400);
    expect(await emailVerifiedAt()).toBeNull();
  });

  it("does not accept a password reset token", async () => {
    await signedUp();
    await post("forgot-password", { email: "owner@example.com" });
    await waitForPendingMail();
    const resetToken = testOutbox.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];

    const res = await post("verify-email", { token: resetToken });

    expect(res.status).toBe(400);
    expect(await emailVerifiedAt()).toBeNull();
  });

  it("keeps the original verification time if already verified", async () => {
    await signedUp();
    const token = verificationTokenFrom();
    const earlier = new Date("2026-01-01T00:00:00.000Z");
    await prisma.user.update({ where: { email: "owner@example.com" }, data: { emailVerifiedAt: earlier } });

    const res = await post("verify-email", { token });

    expect(res.status).toBe(200);
    expect(res.body.data.emailVerifiedAt).toBe(earlier.toISOString());
  });
});

describe("POST /auth/resend-verification", () => {
  it("requires authentication", async () => {
    const res = await post("resend-verification");

    expect(res.status).toBe(401);
  });

  it("sends a new link and invalidates the previous one", async () => {
    const { access } = await signedUp();
    const first = verificationTokenFrom();

    const res = await post("resend-verification", {}, access);
    await waitForPendingMail();
    const second = verificationTokenFrom();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ alreadyVerified: false });
    expect(second).not.toBe(first);
    expect((await post("verify-email", { token: first })).status).toBe(400);
    expect((await post("verify-email", { token: second })).status).toBe(200);
  });

  it("returns 200 with a flag, not an error, when already verified", async () => {
    const { access } = await signedUp();
    await post("verify-email", { token: verificationTokenFrom() });
    testOutbox.length = 0;

    const res = await post("resend-verification", {}, access);
    await waitForPendingMail();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ alreadyVerified: true });
    expect(testOutbox).toHaveLength(0);
  });
});

describe("requireVerifiedEmail", () => {
  // A stand-in for routes like "invite member" or "approve release".
  const guarded = express()
    .use(cookieParser())
    .post("/guarded", requireAuth, requireVerifiedEmail, (_req, res) => {
      res.json({ ok: true });
    })
    .use(errorHandler);

  it("blocks unverified users with a clear code", async () => {
    const { access } = await signedUp();

    const res = await request(guarded).post("/guarded").set("Cookie", `pf_access=${access}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("lets verified users through", async () => {
    const { access } = await signedUp();
    await post("verify-email", { token: verificationTokenFrom() });

    const res = await request(guarded).post("/guarded").set("Cookie", `pf_access=${access}`);

    expect(res.status).toBe(200);
  });

  it("still requires authentication first", async () => {
    const res = await request(guarded).post("/guarded");

    expect(res.status).toBe(401);
  });
});
