import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrganization,
  listOrganizations,
  mapCreateOutcome,
  mapListOutcome,
  type OrganizationSummary,
} from "@/lib/organizations/api";
import {
  needsCustomSlug,
  organizationFieldErrors,
  organizationFormSchema,
  slugPreview,
} from "@/lib/organizations/validation";
import {
  resolveWorkspaceDestination,
  resolveWorkspaceRouteState,
} from "@/lib/organizations/workspace-destination";
import { canManageProjects, resolveOrganizationAccess } from "@/lib/organizations/organization-access";
import { ORGANIZATION_ROLE_LABELS } from "@/lib/organizations/api";
import {
  mapCurrentUserOutcome,
  refreshSession,
  signOut,
} from "@/lib/auth/api";
import { resolveSessionContinuation } from "@/lib/auth/session";

/**
 * These cover the frontend's own responsibility: turning an API response
 * into an outcome the UI can act on, and applying the shared validation rules.
 *
 * The API's own behaviour is already covered by
 * `apps/api/test/organizations.test.js` and is not repeated here.
 */

const organization: OrganizationSummary = {
  id: "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11",
  name: "Acme Studio",
  slug: "acme-studio",
  role: "OWNER",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

describe("mapListOutcome", () => {
  it("returns the organizations on success", () => {
    const outcome = mapListOutcome({
      ok: true,
      status: 200,
      data: { organizations: [organization] },
      message: "Success",
    });

    expect(outcome).toEqual({ status: "success", organizations: [organization] });
  });

  it("returns an empty list when the user belongs to no organizations", () => {
    const outcome = mapListOutcome({
      ok: true,
      status: 200,
      data: { organizations: [] },
      message: "Success",
    });

    expect(outcome).toEqual({ status: "success", organizations: [] });
  });

  it("treats a successful response with no list as an error, not an empty list", () => {
    const outcome = mapListOutcome({
      ok: true,
      status: 200,
      message: "Success",
    });

    expect(outcome.status).toBe("error");
  });

  it("reports an expired session as unauthorized", () => {
    const outcome = mapListOutcome({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Session has ended, please sign in again",
    });

    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("reports a server failure as an error the caller can retry", () => {
    const outcome = mapListOutcome({
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });

    expect(outcome).toEqual({ status: "error", message: "Something went wrong" });
  });

  it("reports a network failure as an error", () => {
    const outcome = mapListOutcome({
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Unable to connect to the server.",
    });

    expect(outcome).toEqual({ status: "error", message: "Unable to connect to the server." });
  });
});

describe("mapCreateOutcome", () => {
  it("returns the created organization on success", () => {
    const outcome = mapCreateOutcome({
      ok: true,
      status: 201,
      data: { organization },
      message: "Success",
    });

    expect(outcome).toEqual({ status: "success", organization });
  });

  it("maps a name validation failure to the name field", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: [{ path: "name", message: "Name must be at least 2 characters" }],
    });

    expect(outcome).toEqual({
      status: "rejected",
      message: "Request validation failed",
      fields: { name: "Name must be at least 2 characters" },
    });
  });

  it("maps a slug validation failure to the slug field", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: [{ path: "slug", message: "Use lowercase letters, numbers and single hyphens" }],
    });

    expect(outcome).toEqual({
      status: "rejected",
      message: "Request validation failed",
      fields: { slug: "Use lowercase letters, numbers and single hyphens" },
    });
  });

  it("maps a rejected slug derivation to the slug field", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 400,
      code: "BAD_REQUEST",
      message: "Couldn't create a URL slug from that name, please choose one",
      details: { field: "slug" },
    });

    expect(outcome).toEqual({
      status: "rejected",
      message: "Couldn't create a URL slug from that name, please choose one",
      fields: { slug: "Couldn't create a URL slug from that name, please choose one" },
    });
  });

  it("maps a conflict on a requested slug to the slug field", () => {
    const outcome = mapCreateOutcome(
      {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message: "That URL slug is already taken",
      },
      "acme-hq",
    );

    expect(outcome).toEqual({
      status: "rejected",
      message: "That URL slug is already taken",
      fields: { slug: "That URL slug is already taken" },
    });
  });

  it("reports a conflict on a derived slug at form level, with no field to correct", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 409,
      code: "CONFLICT",
      message: "Couldn't find a free URL slug, please choose one",
    });

    expect(outcome).toEqual({
      status: "rejected",
      message: "Couldn't find a free URL slug, please choose one",
    });
  });

  it("reports an expired session as unauthorized", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Session has ended, please sign in again",
    });

    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("reports a network failure as unavailable", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Unable to connect to the server. Please check your connection and try again.",
    });

    expect(outcome).toEqual({
      status: "unavailable",
      message: "Unable to connect to the server. Please check your connection and try again.",
    });
  });

  it("treats a successful response with no organization as unavailable", () => {
    const outcome = mapCreateOutcome({
      ok: true,
      status: 201,
      message: "Success",
    });

    expect(outcome.status).toBe("unavailable");
  });

  it("falls back to a form level message for an unrecognised failure", () => {
    const outcome = mapCreateOutcome({
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });

    expect(outcome).toEqual({ status: "rejected", message: "Something went wrong" });
  });
});

describe("slugPreview", () => {
  it("derives the same slug the backend derives", () => {
    expect(slugPreview("Acme Studio & Co.")).toBe("acme-studio-co");
  });

  it("ignores surrounding whitespace", () => {
    expect(slugPreview("  Acme Studio & Co.  ")).toBe("acme-studio-co");
  });

  it("has no preview for a name with no letters or numbers", () => {
    expect(slugPreview("!!!")).toBeNull();
  });

  it("has no preview when the derived slug would be too short", () => {
    expect(slugPreview("AB")).toBeNull();
  });
});

describe("needsCustomSlug", () => {
  it("is false for a name that derives a usable slug", () => {
    expect(needsCustomSlug("Acme Studio")).toBe(false);
  });

  it("is true for a name that cannot derive a usable slug", () => {
    expect(needsCustomSlug("!!!")).toBe(true);
  });

  it("is false for an empty name, so the slug field stays closed", () => {
    expect(needsCustomSlug("")).toBe(false);
    expect(needsCustomSlug("   ")).toBe(false);
  });
});

describe("organizationFormSchema", () => {
  it("accepts a name with a derived slug", () => {
    const result = organizationFormSchema.safeParse({ name: "Acme Studio" });

    expect(result.success).toBe(true);
  });

  it("accepts an empty custom slug, meaning the backend derives one", () => {
    const result = organizationFormSchema.safeParse({ name: "Acme Studio", slug: "" });

    expect(result.success).toBe(true);
  });

  it("normalises a custom slug the way the backend does", () => {
    const result = organizationFormSchema.safeParse({ name: "Acme Studio", slug: "Acme-HQ" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("acme-hq");
    }
  });

  it("rejects a name that is too short", () => {
    const result = organizationFormSchema.safeParse({ name: "A" });

    expect(result.success).toBe(false);
  });

  it("rejects a name that is too long", () => {
    const result = organizationFormSchema.safeParse({ name: "a".repeat(161) });

    expect(result.success).toBe(false);
  });

  it("rejects a custom slug with invalid characters", () => {
    const result = organizationFormSchema.safeParse({ name: "Acme Studio", slug: "Not a slug!" });

    expect(result.success).toBe(false);
  });
});

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("resolveWorkspaceDestination", () => {
  it("sends a user with no organizations to onboarding", () => {
    expect(resolveWorkspaceDestination([])).toEqual({ kind: "onboarding" });
  });

  it("sends a user with exactly one organization straight to it", () => {
    expect(resolveWorkspaceDestination([{ slug: "acme-studio" }])).toEqual({
      kind: "workspace",
      slug: "acme-studio",
    });
  });

  it("sends a user with more than one organization to the chooser", () => {
    expect(
      resolveWorkspaceDestination([{ slug: "acme-studio" }, { slug: "globex" }]),
    ).toEqual({ kind: "chooser" });
  });

  it("picks the slug of the only organization", () => {
    const organizations = [
      { id: "1", name: "Globex", slug: "globex" },
      { id: "2", name: "Acme Studio", slug: "acme-studio" },
    ];

    // The first entry is the only one, so its slug must be the one returned.
    expect(resolveWorkspaceDestination([organizations[0]])).toEqual({
      kind: "workspace",
      slug: "globex",
    });
    expect(resolveWorkspaceDestination([organizations[1]])).toEqual({
      kind: "workspace",
      slug: "acme-studio",
    });
  });

  it("does not change the organizations it is given", () => {
    const organizations = Object.freeze([
      Object.freeze({ slug: "acme-studio" }),
      Object.freeze({ slug: "globex" }),
    ]);
    const before = [...organizations];

    resolveWorkspaceDestination(organizations);

    expect(organizations).toEqual(before);
    expect(organizations).toHaveLength(2);
  });

  it("returns the same result for repeated calls", () => {
    const organizations = [{ slug: "acme-studio" }];

    const first = resolveWorkspaceDestination(organizations);
    const second = resolveWorkspaceDestination(organizations);
    const third = resolveWorkspaceDestination(organizations);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(resolveWorkspaceDestination([])).toEqual(
      resolveWorkspaceDestination([]),
    );
  });
});

describe("organizationFieldErrors", () => {
  it("maps an issue to the field it belongs to", () => {
    const result = organizationFormSchema.safeParse({ name: "A" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(organizationFieldErrors(result.error.issues)).toEqual({
        name: "Name must be at least 2 characters",
      });
    }
  });

  it("maps a slug issue to the slug field", () => {
    const result = organizationFormSchema.safeParse({
      name: "Acme Studio",
      slug: "Not a slug!",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(organizationFieldErrors(result.error.issues)).toEqual({
        slug: "Use lowercase letters, numbers and single hyphens",
      });
    }
  });

  it("keeps only the first message for a field", () => {
    const errors = organizationFieldErrors([
      { path: ["name"], message: "first" },
      { path: ["name"], message: "second" },
    ] as unknown as Parameters<typeof organizationFieldErrors>[0]);

    expect(errors).toEqual({ name: "first" });
  });

  it("ignores issues for fields the form does not show", () => {
    const errors = organizationFieldErrors([
      { path: ["somethingElse"], message: "ignored" },
    ] as unknown as Parameters<typeof organizationFieldErrors>[0]);

    expect(errors).toEqual({});
  });
});

describe("resolveWorkspaceRouteState", () => {
  it("allows content once the list is loaded", () => {
    expect(resolveWorkspaceRouteState("ready")).toBe("ready");
  });

  it("offers a retry when the list could not be loaded", () => {
    expect(resolveWorkspaceRouteState("error")).toBe("error");
  });

  it("waits while the list is loading", () => {
    expect(resolveWorkspaceRouteState("loading")).toBe("loading");
  });

  it("does not treat an unauthorized session as content", () => {
    // A refused session is not an empty list, so the route must not fall
    // back to the chooser or to onboarding.
    expect(resolveWorkspaceRouteState("unauthorized")).toBe("loading");
  });
});

describe("resolveOrganizationAccess", () => {
  it("finds an organization by its slug", () => {
    const access = resolveOrganizationAccess([organization], "acme-studio");

    expect(access).toEqual({ kind: "available", organization });
  });

  it("ignores the case of the slug in the URL", () => {
    const access = resolveOrganizationAccess([organization], "Acme-Studio");

    expect(access).toEqual({ kind: "available", organization });
  });

  it("reports an unknown slug as unavailable", () => {
    const access = resolveOrganizationAccess([organization], "other-studio");

    expect(access).toEqual({ kind: "unavailable" });
  });

  it("reports a slug the user has no access to as unavailable", () => {
    const access = resolveOrganizationAccess([], "acme-studio");

    expect(access).toEqual({ kind: "unavailable" });
  });
});

describe("canManageProjects", () => {
  it("lets owners and admins create and edit projects", () => {
    expect(canManageProjects("OWNER")).toBe(true);
    expect(canManageProjects("ADMIN")).toBe(true);
  });

  it("keeps members read-only", () => {
    expect(canManageProjects("MEMBER")).toBe(false);
  });
});

describe("mapCurrentUserOutcome", () => {
  const user = {
    id: "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11",
    email: "tester@example.com",
    name: "Tester",
    emailVerifiedAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
  };

  it("returns the session when the API answers", () => {
    const outcome = mapCurrentUserOutcome({
      ok: true,
      status: 200,
      data: { user, memberships: [] },
      message: "Success",
    });

    expect(outcome).toEqual({
      status: "authenticated",
      user,
      memberships: [],
    });
  });

  it("treats a confirmed 401 as a signed-out session", () => {
    const outcome = mapCurrentUserOutcome({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });

    expect(outcome).toEqual({ status: "unauthenticated" });
  });

  it("treats a network failure as unavailable, not as signed out", () => {
    const outcome = mapCurrentUserOutcome({
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Unable to connect to the server.",
    });

    expect(outcome).toEqual({
      status: "unavailable",
      message: "Unable to connect to the server.",
    });
  });

  it("treats a server error as unavailable, not as signed out", () => {
    const outcome = mapCurrentUserOutcome({
      ok: false,
      status: 500,
      message: "Internal server error",
    });

    expect(outcome).toEqual({
      status: "unavailable",
      message: "Internal server error",
    });
  });

  it("treats a successful response without a user as unavailable", () => {
    const outcome = mapCurrentUserOutcome({
      ok: true,
      status: 200,
      message: "Success",
    });

    expect(outcome.status).toBe("unavailable");
  });
});

describe("refreshSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a completed refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    await expect(refreshSession()).resolves.toBe("refreshed");
  });

  it("reports a rejected session for an authorization answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));

    await expect(refreshSession()).resolves.toBe("rejected");
  });

  it("reports a server error as unavailable, not as a revoked session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(refreshSession()).resolves.toBe("unavailable");
  });

  it("reports a rate limit as unavailable, not as a revoked session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429 })));

    await expect(refreshSession()).resolves.toBe("unavailable");
  });

  it("reports an unreachable service as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(refreshSession()).resolves.toBe("unavailable");
  });
});

describe("signOut", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms a completed sign-out", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ success: true, message: "Signed out" }, 200);
      }),
    );

    await expect(signOut()).resolves.toEqual({ status: "signed-out" });
    expect(calls[0].url).toContain("/api/v1/auth/logout");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("does not confirm a sign-out when the service cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const outcome = await signOut();

    expect(outcome.status).toBe("unavailable");
    expect(outcome).toMatchObject({ message: expect.stringContaining("may still be active") });
  });

  it("does not confirm a sign-out when the server fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: false, message: "Internal server error" }, 500)),
    );

    await expect(signOut()).resolves.toMatchObject({ status: "unavailable" });
  });

  it("confirms the sign-out when a retry succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(jsonResponse({ success: true }, 200)),
    );

    await expect(signOut()).resolves.toMatchObject({ status: "unavailable" });
    await expect(signOut()).resolves.toEqual({ status: "signed-out" });
  });
});

describe("resolveSessionContinuation", () => {
  it("offers the workspace to a signed-in user", () => {
    expect(resolveSessionContinuation("authenticated")).toBe("workspace");
  });

  it("offers sign in to a signed-out user", () => {
    expect(resolveSessionContinuation("unauthenticated")).toBe("sign-in");
  });

  it("offers nothing while the session is being checked", () => {
    expect(resolveSessionContinuation("loading")).toBe("pending");
  });

  it("offers nothing when the session could not be checked", () => {
    expect(resolveSessionContinuation("unavailable")).toBe("pending");
  });
});

describe("ORGANIZATION_ROLE_LABELS", () => {
  it("has a readable label for every role", () => {
    expect(ORGANIZATION_ROLE_LABELS).toEqual({
      OWNER: "Owner",
      ADMIN: "Admin",
      MEMBER: "Member",
    });
  });
});

describe("organization client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends credentialed requests to the organizations endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ success: true, data: { organizations: [organization] } }, 200);
      }),
    );

    const outcome = await listOrganizations();

    expect(outcome).toEqual({ status: "success", organizations: [organization] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/v1/organizations");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("omits an empty custom slug so the backend derives one", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ success: true, data: { organization } }, 201);
      }),
    );

    const outcome = await createOrganization({ name: "Acme Studio", slug: "" });

    expect(outcome).toEqual({ status: "success", organization });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "Acme Studio" });
  });

  it("sends a requested custom slug", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ success: true, data: { organization } }, 201);
      }),
    );

    await createOrganization({ name: "Acme Studio", slug: "acme-hq" });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Acme Studio",
      slug: "acme-hq",
    });
  });

  it("refreshes the session and retries once when the access token has expired", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));

        if (String(url).endsWith("/api/v1/auth/refresh")) {
          return jsonResponse({ success: true }, 200);
        }

        if (calls.filter((c) => c.endsWith("/api/v1/organizations")).length === 1) {
          return jsonResponse(
            { success: false, code: "UNAUTHORIZED", message: "Authentication required" },
            401,
          );
        }

        return jsonResponse({ success: true, data: { organizations: [organization] } }, 200);
      }),
    );

    const outcome = await listOrganizations();

    expect(outcome).toEqual({ status: "success", organizations: [organization] });
    expect(calls.filter((c) => c.endsWith("/api/v1/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((c) => c.endsWith("/api/v1/organizations"))).toHaveLength(2);
  });

  it("reports unauthorized when the session cannot be refreshed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/v1/auth/refresh")) {
          return jsonResponse({ success: false }, 401);
        }

        return jsonResponse(
          { success: false, code: "UNAUTHORIZED", message: "Session has ended, please sign in again" },
          401,
        );
      }),
    );

    const outcome = await createOrganization({ name: "Acme Studio" });

    expect(outcome).toEqual({ status: "unauthorized" });
  });
});
