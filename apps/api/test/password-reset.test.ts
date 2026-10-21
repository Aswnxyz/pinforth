import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { testOutbox, waitForPendingMail } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/modules/auth/tokens.js";
import { cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

const NEW_PASSWORD = "a brand new passphrase";

const post = (path: string, body: object) =>
  request(app).post(`/api/v1/auth/${path}`).set("Origin", WEB_ORIGIN).send(body);

const forgot = async (email = credentials().email) => {
  const res = await post("forgot-password", { email });
  await waitForPendingMail();
  return res;
};

const tokenFromLastEmail = () => {
  const match = testOutbox.at(-1)?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No reset link in the last email");
  return match[1];
};

const me = (access: string) => request(app).get("/api/v1/auth/me").set("Cookie", `pf_access=${access}`);

beforeEach(async () => {
  await resetDatabase();
  testOutbox.length = 0;
  await post("signup", credentials());
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /auth/forgot-password", () => {
  it("emails a single-use reset link to an existing account", async () => {
    const res = await forgot("  OWNER@example.com ");

    expect(res.status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].to).toBe("owner@example.com");
    expect(testOutbox[0].subject).toMatch(/reset/i);
    expect(testOutbox[0].text).toContain("http://localhost:3000/reset-password?token=");

    const token = tokenFromLastEmail();
    const stored = await prisma.verificationToken.findFirstOrThrow({ where: { type: "PASSWORD_RESET" } });
    expect(stored.tokenHash).toBe(hashToken(token));
  });

  it("responds identically for an unknown email and sends nothing", async () => {
    const known = await forgot();
    testOutbox.length = 0;
    const unknown = await forgot("nobody@example.com");

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(testOutbox).toHaveLength(0);
  });

  it("only the newest link works when several are requested", async () => {
    await forgot();
    const first = tokenFromLastEmail();
    await forgot();
    const second = tokenFromLastEmail();

    expect((await post("reset-password", { token: first, password: NEW_PASSWORD })).status).toBe(400);
    expect((await post("reset-password", { token: second, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("validates the email", async () => {
    const res = await forgot("not-an-email");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("escapes the user's name in the HTML email", async () => {
    await resetDatabase();
    await post("signup", credentials({ name: "<script>alert(1)</script>" }));

    await forgot();

    expect(testOutbox.at(-1)!.html).not.toContain("<script>");
    expect(testOutbox.at(-1)!.html).toContain("&#60;script&#62;");
  });
});

describe("POST /auth/reset-password", () => {
  it("sets the new password, signs out everywhere and sends a confirmation", async () => {
    const before = await post("login", credentials());
    const oldAccess = cookieValue(before, "pf_access")!;
    const oldRefresh = cookieValue(before, "pf_refresh")!;

    await forgot();
    const res = await post("reset-password", { token: tokenFromLastEmail(), password: NEW_PASSWORD });
    await waitForPendingMail();

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sign in/i);

    // Old credentials and sessions are dead.
    expect((await post("login", credentials())).status).toBe(401);
    expect((await me(oldAccess)).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/auth/refresh").set("Origin", WEB_ORIGIN).set("Cookie", `pf_refresh=${oldRefresh}`))
        .status
    ).toBe(401);

    // New password works.
    expect((await post("login", credentials({ password: NEW_PASSWORD }))).status).toBe(200);

    expect(testOutbox.at(-1)!.subject).toMatch(/password was changed/i);
  });

  it("marks the email verified, since the link proved ownership", async () => {
    await forgot();
    await post("reset-password", { token: tokenFromLastEmail(), password: NEW_PASSWORD });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("lets an invited, password-less account set its first password", async () => {
    await prisma.user.create({ data: { email: "invited@example.com" } });

    await forgot("invited@example.com");
    const res = await post("reset-password", { token: tokenFromLastEmail(), password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect((await post("login", { email: "invited@example.com", password: NEW_PASSWORD })).status).toBe(200);
  });

  it("refuses to reuse a link", async () => {
    await forgot();
    const token = tokenFromLastEmail();

    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(200);

    const again = await post("reset-password", { token, password: "yet another passphrase" });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("lets only one of two simultaneous uses succeed", async () => {
    await forgot();
    const token = tokenFromLastEmail();

    const results = await Promise.all([
      post("reset-password", { token, password: "first concurrent password" }),
      post("reset-password", { token, password: "second concurrent password" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("rejects an expired link", async () => {
    await forgot();
    const token = tokenFromLastEmail();
    await prisma.verificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await post("reset-password", { token, password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("rejects an unknown token or one meant for something else", async () => {
    const unknown = await post("reset-password", { token: "x".repeat(43), password: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } });
    const verifyToken = "v".repeat(43);
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: "EMAIL_VERIFY",
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const wrongType = await post("reset-password", { token: verifyToken, password: NEW_PASSWORD });
    expect(wrongType.status).toBe(400);
  });

  it("keeps the link usable when the new password is rejected", async () => {
    await forgot();
    const token = tokenFromLastEmail();

    const tooShort = await post("reset-password", { token, password: "short" });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.code).toBe("VALIDATION_ERROR");

    const isEmail = await post("reset-password", { token, password: "owner@example.com" });
    expect(isEmail.status).toBe(400);

    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(200);
  });
});
