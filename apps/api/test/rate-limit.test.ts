import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { credentials, WEB_ORIGIN } from "./helpers.js";

// Limits are off for the other suites; load a fresh app with them on.
vi.stubEnv("AUTH_RATE_LIMIT", "true");

const { default: app } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { resetDatabase } = await import("./reset-database.js");

const login = (body: object) =>
  request(app).post("/api/v1/auth/login").set("Origin", WEB_ORIGIN).send(body);

describe("auth rate limits", () => {
  beforeAll(async () => {
    await resetDatabase();
    await request(app).post("/api/v1/auth/signup").set("Origin", WEB_ORIGIN).send(credentials());
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("blocks an account after 5 failed logins, without counting successes", async () => {
    // Successful logins are skipped by the per-account limiter.
    for (let i = 0; i < 3; i++) {
      expect((await login(credentials())).status).toBe(200);
    }

    for (let i = 0; i < 5; i++) {
      expect((await login(credentials({ password: "wrong password here" }))).status).toBe(401);
    }

    const blocked = await login(credentials({ password: "wrong password here" }));

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["ratelimit-policy"] ?? blocked.headers["ratelimit"]).toBeDefined();
  });

  it("limits per account, so other accounts from the same IP still work", async () => {
    const other = await login(credentials({ email: "someone-else@example.com" }));

    expect(other.status).toBe(401);
  });
});
