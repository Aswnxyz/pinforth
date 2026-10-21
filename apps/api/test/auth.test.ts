import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/modules/auth/tokens.js";
import { cookieLine, cookieValue, credentials, WEB_ORIGIN } from "./helpers.js";
import { resetDatabase } from "./reset-database.js";

const signup = (body: object = credentials()) =>
  request(app).post("/api/v1/auth/signup").set("Origin", WEB_ORIGIN).send(body);

const login = (body: object = credentials()) =>
  request(app).post("/api/v1/auth/login").set("Origin", WEB_ORIGIN).send(body);

const me = (accessToken?: string) => {
  const req = request(app).get("/api/v1/auth/me");
  return accessToken ? req.set("Cookie", `pf_access=${accessToken}`) : req;
};

const refresh = (refreshToken?: string) => {
  const req = request(app).post("/api/v1/auth/refresh").set("Origin", WEB_ORIGIN);
  return refreshToken ? req.set("Cookie", `pf_refresh=${refreshToken}`) : req;
};

async function signedUp() {
  const res = await signup();
  return {
    res,
    access: cookieValue(res, "pf_access")!,
    refresh: cookieValue(res, "pf_refresh")!,
    userId: res.body.data.user.id as string,
  };
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /auth/signup", () => {
  it("creates the user, returns a safe profile and sets auth cookies", async () => {
    const res = await signup(credentials({ email: "  Owner@Example.COM " }));

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: "owner@example.com",
      name: "Agency Owner",
      emailVerifiedAt: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.body.data.accessTokenExpiresAt).toEqual(expect.any(String));

    const access = cookieLine(res, "pf_access")!;
    const refreshCookie = cookieLine(res, "pf_refresh")!;
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\/api(;|$)/);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth(;|$)/);
  });

  it("stores an argon2id hash, never the password", async () => {
    await signup();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(credentials().password);
  });

  it("stores only a hash of the refresh token", async () => {
    const { refresh: token } = await signedUp();

    const session = await prisma.session.findFirstOrThrow();
    expect(session.refreshTokenHash).toBe(hashToken(token));
    expect(session.refreshTokenHash).not.toBe(token);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await signup();
    const res = await signup(credentials({ email: "OWNER@example.com" }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it.each([
    ["short password", { password: "short" }],
    ["invalid email", { email: "not-an-email" }],
    ["password equal to email", { password: "owner@example.com" }],
  ])("rejects %s", async (_label, override) => {
    const res = await signup(credentials(override));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects requests from an untrusted origin", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .set("Origin", "https://evil.example")
      .send(credentials());

    expect(res.status).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await signup();
  });

  it("logs in with the right password, case-insensitive email", async () => {
    const res = await login(credentials({ email: "OWNER@example.com" }));

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("owner@example.com");
    expect(cookieValue(res, "pf_access")).toBeTruthy();
    expect(cookieValue(res, "pf_refresh")).toBeTruthy();
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrongPassword = await login(credentials({ password: "wrong password here" }));
    const unknownEmail = await login(credentials({ email: "nobody@example.com" }));

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.code).toBe("INVALID_CREDENTIALS");
    expect(cookieLine(wrongPassword, "pf_access")).toBeUndefined();
  });

  it("does not let a password-less (invited) account log in", async () => {
    await prisma.user.create({ data: { email: "invited@example.com" } });

    const res = await login(credentials({ email: "invited@example.com" }));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /auth/me and requireAuth", () => {
  it("requires authentication", async () => {
    const res = await me();

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("returns the user and their organization memberships", async () => {
    const { access, userId } = await signedUp();
    const org = await prisma.organization.create({ data: { name: "Acme Studio", slug: "acme" } });
    await prisma.organizationMember.create({
      data: { userId, organizationId: org.id, role: "OWNER" },
    });

    const res = await me(access);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.memberships).toEqual([
      { role: "OWNER", organization: { id: org.id, name: "Acme Studio", slug: "acme" } },
    ]);
  });

  it("accepts a Bearer token for non-browser clients", async () => {
    const { access } = await signedUp();

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${access}`);

    expect(res.status).toBe(200);
  });

  it("rejects a tampered token", async () => {
    const { access } = await signedUp();
    const [header, payload, signature] = access.split(".");
    const tampered = `${header}.${payload}.${signature.slice(0, -2)}xx`;

    const res = await me(tampered);

    expect(res.status).toBe(401);
  });

  it("rejects a token signed with another secret", async () => {
    const { userId } = await signedUp();
    const session = await prisma.session.findFirstOrThrow();
    const forged = await new SignJWT({ sid: session.id, fid: session.familyId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("pinforth-api")
      .setAudience("pinforth-web")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-123"));

    const res = await me(forged);

    expect(res.status).toBe(401);
  });

  it("tells the client to refresh when the access token has expired", async () => {
    const { userId } = await signedUp();
    const session = await prisma.session.findFirstOrThrow();
    const expired = await new SignJWT({ sid: session.id, fid: session.familyId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("pinforth-api")
      .setAudience("pinforth-web")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    const res = await me(expired);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCESS_TOKEN_EXPIRED");
  });

  it("rejects the token once the user is deleted", async () => {
    const { access, userId } = await signedUp();
    await prisma.user.delete({ where: { id: userId } });

    const res = await me(access);

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const first = await signedUp();

    const res = await refresh(first.refresh);
    const nextRefresh = cookieValue(res, "pf_refresh")!;
    const nextAccess = cookieValue(res, "pf_access")!;

    expect(res.status).toBe(200);
    expect(nextRefresh).toBeTruthy();
    expect(nextRefresh).not.toBe(first.refresh);
    expect((await me(nextAccess)).status).toBe(200);

    const old = await prisma.session.findUniqueOrThrow({
      where: { refreshTokenHash: hashToken(first.refresh) },
    });
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedById).not.toBeNull();
  });

  it("keeps the previous access token working after a normal rotation", async () => {
    const first = await signedUp();
    await refresh(first.refresh);

    expect((await me(first.access)).status).toBe(200);
  });

  it("rejects a missing or unknown refresh token and clears cookies", async () => {
    const missing = await refresh();
    const unknown = await refresh("not-a-real-token");

    expect(missing.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("INVALID_REFRESH_TOKEN");
    expect(cookieLine(unknown, "pf_refresh")).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("treats a concurrent reuse (two tabs) as a race, not theft", async () => {
    const first = await signedUp();
    const winner = await refresh(first.refresh);
    const loser = await refresh(first.refresh);

    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);
    // The winner's new session survives.
    expect((await me(cookieValue(winner, "pf_access"))).status).toBe(200);
  });

  it("revokes the whole login when an old refresh token is replayed later", async () => {
    const first = await signedUp();
    const rotated = await refresh(first.refresh);
    const attackerCopy = first.refresh;

    // Move the rotation outside the race window.
    await prisma.session.update({
      where: { refreshTokenHash: hashToken(first.refresh) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await refresh(attackerCopy);

    expect(replay.status).toBe(401);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    // Both the legitimate refresh token and access token are now dead.
    expect((await refresh(cookieValue(rotated, "pf_refresh"))).status).toBe(401);
    expect((await me(cookieValue(rotated, "pf_access"))).status).toBe(401);
  });

  it("rejects an expired session", async () => {
    const first = await signedUp();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await refresh(first.refresh);

    expect(res.status).toBe(401);
  });
});

describe("logout", () => {
  it("ends the session: access and refresh tokens stop working", async () => {
    const session = await signedUp();

    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `pf_refresh=${session.refresh}`);

    expect(res.status).toBe(200);
    expect(cookieLine(res, "pf_access")).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await me(session.access)).status).toBe(401);
    expect((await refresh(session.refresh)).status).toBe(401);
  });

  it("succeeds even without a session", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set("Origin", WEB_ORIGIN);

    expect(res.status).toBe(200);
  });

  it("logout-all signs out every device", async () => {
    const laptop = await signedUp();
    const phoneLogin = await login();
    const phoneAccess = cookieValue(phoneLogin, "pf_access")!;

    const res = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `pf_access=${laptop.access}`);

    expect(res.status).toBe(200);
    expect((await me(laptop.access)).status).toBe(401);
    expect((await me(phoneAccess)).status).toBe(401);
  });

  it("logout-all requires authentication", async () => {
    const res = await request(app).post("/api/v1/auth/logout-all").set("Origin", WEB_ORIGIN);

    expect(res.status).toBe(401);
  });
});
