import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./reset-database.js";

const hash = (char) => char.repeat(64);

describe("auth schema", () => {
  beforeEach(resetDatabase);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs against the test database", async () => {
    const [{ db }] = await prisma.$queryRaw`SELECT current_database() AS db`;

    expect(db.endsWith("_test")).toBe(true);
  });

  it("creates a user without a password (invited / OAuth users)", async () => {
    const user = await prisma.user.create({ data: { email: "invited@example.com" } });

    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("links rotated sessions and cascades on user delete", async () => {
    const user = await prisma.user.create({
      data: { email: "owner@example.com", passwordHash: "argon2-hash" },
    });
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);

    const first = await prisma.session.create({
      data: { userId: user.id, familyId, refreshTokenHash: hash("a"), expiresAt },
    });
    const second = await prisma.session.create({
      data: { userId: user.id, familyId, refreshTokenHash: hash("b"), expiresAt },
    });

    await prisma.session.update({
      where: { id: first.id },
      data: { revokedAt: new Date(), replacedById: second.id },
    });

    const rotated = await prisma.session.findUniqueOrThrow({
      where: { id: first.id },
      include: { replacedBy: true },
    });
    expect(rotated.replacedBy?.id).toBe(second.id);

    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects duplicate refresh token hashes", async () => {
    const user = await prisma.user.create({ data: { email: "dup@example.com" } });
    const data = {
      userId: user.id,
      familyId: randomUUID(),
      refreshTokenHash: hash("c"),
      expiresAt: new Date(Date.now() + 60_000),
    };

    await prisma.session.create({ data });

    await expect(prisma.session.create({ data })).rejects.toThrow();
  });

  it("stores single-use verification tokens", async () => {
    const user = await prisma.user.create({ data: { email: "reset@example.com" } });

    const token = await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: "PASSWORD_RESET",
        tokenHash: hash("d"),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    expect(token.usedAt).toBeNull();
    expect(token.type).toBe("PASSWORD_RESET");
  });
});
