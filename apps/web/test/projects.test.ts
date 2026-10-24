import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createEnvironment,
  createProject,
  getProject,
  listProjects,
  updateEnvironment,
  updateProject,
} from "@/lib/projects/api";
import { projectSlugPreview } from "@/lib/projects/preview";
import { validateEnvironmentValues } from "@/lib/projects/environment-validation";
import {
  changesAreLive,
  describeEditProjectFailure,
  prepareProjectUpdate,
  UNCONFIRMED_EDIT_MESSAGE,
} from "@/lib/projects/project-edit";
import {
  describeCreateProjectFailure,
  projectDestination,
} from "@/lib/projects/project-creation";
import {
  describeCreationFollowUp,
  describeEnvironmentCreateFailure,
  environmentListed,
  environmentMatches,
  ENVIRONMENT_CREATED_DETAILS_NOT_LOADED_MESSAGE,
  ENVIRONMENT_CREATED_NOT_SHOWN_MESSAGE,
  UNCONFIRMED_CREATE_MESSAGE,
} from "@/lib/projects/environment-create";
import {
  createEnvironmentEditState,
  describeEnvironmentEditFailure,
  environmentChangesAreLive,
  prepareEnvironmentUpdate,
  UNCONFIRMED_ENVIRONMENT_EDIT_MESSAGE,
} from "@/lib/projects/environment-edit";
import {
  createRequestGuard,
  loadProjectDetail,
  resolveProjectDetailState,
} from "@/lib/projects/project-detail";
import {
  loadProjectList,
  resolveProjectListState,
  type ProjectListState,
} from "@/lib/projects/project-list";
import { safeWebsiteUrl } from "@/lib/projects/urls";

/**
 * The project URL preview is display-only logic until the shared project
 * schemas land. These cover the pure helpers: when a provisional slug can be
 * shown, when a reserved name still needs generating a URL, when no
 * acceptable slug exists, and which environment URLs are safe to open.
 */

describe("projectSlugPreview", () => {
  it("derives a slug from a typical project name", () => {
    expect(projectSlugPreview("Restaurant Website Redesign")).toEqual({
      kind: "slug",
      slug: "restaurant-website-redesign",
    });
  });

  it("trims surrounding whitespace and ignores punctuation", () => {
    expect(projectSlugPreview("  Acme & Co. ")).toEqual({
      kind: "slug",
      slug: "acme-co",
    });
  });

  it("returns none for an empty or whitespace-only name", () => {
    expect(projectSlugPreview("")).toEqual({ kind: "none" });
    expect(projectSlugPreview("   ")).toEqual({ kind: "none" });
  });

  it("returns none when the name is too short to form a usable slug", () => {
    // Regression: a name of valid length can still produce no usable URL.
    expect(projectSlugPreview("AB")).toEqual({ kind: "none" });
  });

  it("returns none when the name has no letters or numbers", () => {
    // Regression: three characters, but nothing to build a slug from.
    expect(projectSlugPreview("!!!")).toEqual({ kind: "none" });
  });

  it("treats a reserved name as valid but un-previewable", () => {
    // Regression: "New" is a fine project name; the backend generates a
    // suffixed slug, so the preview must not reject it nor invent a suffix.
    expect(projectSlugPreview("New")).toEqual({ kind: "reserved" });
  });

  it("returns a slug for a name that mixes words and numbers", () => {
    expect(projectSlugPreview("Project 2")).toEqual({
      kind: "slug",
      slug: "project-2",
    });
  });

  it("long names stay within the 60-character slug bound", () => {
    const preview = projectSlugPreview(
      "A very long client website redesign project name that keeps going and going",
    );

    expect(preview.kind).toBe("slug");
    if (preview.kind !== "slug") return;

    expect(preview.slug.length).toBeLessThanOrEqual(60);
    expect(preview.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("safeWebsiteUrl", () => {
  it("accepts http and https addresses", () => {
    expect(safeWebsiteUrl("https://staging.example.com")).toBe(
      "https://staging.example.com/",
    );
    expect(safeWebsiteUrl("http://example.com/page?x=1")).toBe(
      "http://example.com/page?x=1",
    );
  });

  it("normalises surrounding whitespace", () => {
    expect(safeWebsiteUrl("  https://example.com  ")).toBe(
      "https://example.com/",
    );
  });

  it("rejects executable or non-web schemes", () => {
    expect(safeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebsiteUrl("data:text/html,<script></script>")).toBeNull();
    expect(safeWebsiteUrl("ftp://files.example.com")).toBeNull();
  });

  it("rejects URLs with embedded credentials", () => {
    expect(safeWebsiteUrl("https://user:password@example.com")).toBeNull();
    expect(safeWebsiteUrl("https://user@example.com")).toBeNull();
  });

  it("rejects URLs with no usable hostname", () => {
    // The parser normalises "https:///path" into host "path", so the
    // genuinely hostless forms are these — both fail to parse.
    expect(safeWebsiteUrl("https://")).toBeNull();
    expect(safeWebsiteUrl("http://:3000")).toBeNull();
  });

  it("accepts local development addresses", () => {
    expect(safeWebsiteUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/",
    );
  });

  it("rejects anything that is not a valid URL", () => {
    expect(safeWebsiteUrl("not a url")).toBeNull();
    expect(safeWebsiteUrl("")).toBeNull();
  });
});

describe("validateEnvironmentValues", () => {
  it("accepts the example valid URLs and trims both fields", () => {
    for (const url of [
      "https://staging.example.com",
      "https://example.com",
      "http://localhost:3000",
    ]) {
      const result = validateEnvironmentValues({
        name: "  Staging  ",
        url: `  ${url}  `,
      });

      expect(result).toEqual({ ok: true, values: { name: "Staging", url } });
    }
  });

  it("rejects the example invalid URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "ftp://example.com",
      "https://user:password@example.com",
      "not-a-url",
    ]) {
      const result = validateEnvironmentValues({ name: "Staging", url });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.url).toBeTruthy();
    }
  });

  it("requires a URL", () => {
    const result = validateEnvironmentValues({ name: "Staging", url: "   " });

    expect(result).toEqual({
      ok: false,
      errors: { url: "Website URL is required." },
    });
  });

  it("enforces the 2048-character URL limit", () => {
    const base = "https://example.com/";
    const atLimit = base + "a".repeat(2048 - base.length);

    expect(
      validateEnvironmentValues({ name: "Staging", url: atLimit }).ok,
    ).toBe(true);

    const overLimit = validateEnvironmentValues({
      name: "Staging",
      url: base + "a".repeat(2049 - base.length),
    });

    expect(overLimit.ok).toBe(false);
    if (!overLimit.ok) expect(overLimit.errors.url).toContain("2,048");
  });

  it("enforces the 2–100 character name limits", () => {
    const short = validateEnvironmentValues({ name: "S", url: "https://example.com" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors.name).toBeTruthy();

    const long = validateEnvironmentValues({
      name: "a".repeat(101),
      url: "https://example.com",
    });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.name).toContain("100");

    expect(
      validateEnvironmentValues({
        name: "a".repeat(100),
        url: "https://example.com",
      }).ok,
    ).toBe(true);
  });

  it("reports every invalid field at once", () => {
    const result = validateEnvironmentValues({ name: "", url: "not-a-url" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["name", "url"]);
  });

  it("prepares the same trimmed payload for create and edit", () => {
    // The mode only changes the starting values; submission preparation is
    // identical.
    const created = validateEnvironmentValues({
      name: " Production ",
      url: " https://example.com ",
    });
    const edited = validateEnvironmentValues({
      name: " Production",
      url: "https://example.com",
    });

    expect(created).toEqual(edited);
    if (!created.ok) return;
    expect(created.values).toEqual({
      name: "Production",
      url: "https://example.com",
    });
  });
});

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const projectSummary = {
  id: "3b6f1a2c-9d4e-4f80-b1a2-c3d4e5f60718",
  name: "Restaurant Website Redesign",
  slug: "restaurant-website-redesign",
  description: "Website redesign for our client",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

const environment = {
  id: "7c1d9e3b-2a5f-4c8d-9e0a-1b2c3d4e5f60",
  name: "Staging",
  slug: "staging",
  url: "https://staging.example.com",
  createdAt: "2026-10-02T09:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
};

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const BASE = `/api/v1/organizations/${ORG_ID}/projects`;

/** Captures requests and answers with a fixed JSON response. */
function stubFetch(
  responder: (url: string, init: RequestInit) => Response,
): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder(String(url), init);
    }),
  );

  return calls;
}

describe("project client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists projects with a credentialed GET to the organization endpoint", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { projects: [projectSummary] } }, 200),
    );

    const outcome = await listProjects(ORG_ID);

    expect(outcome).toEqual({ status: "success", data: [projectSummary] });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("keeps an empty project list as a success, not an error", async () => {
    stubFetch(() => jsonResponse({ success: true, data: { projects: [] } }, 200));

    await expect(listProjects(ORG_ID)).resolves.toEqual({
      status: "success",
      data: [],
    });
  });

  it("never turns a failed list request into an empty list", async () => {
    // A 200 whose body carries no projects array is unreadable, not empty.
    stubFetch(() => jsonResponse({ success: true, data: {} }, 200));

    await expect(listProjects(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reports an expired session as unauthorized", async () => {
    // The refresh attempt also answers 401, so the session is genuinely over.
    stubFetch(() =>
      jsonResponse({ success: false, code: "UNAUTHORIZED", message: "no" }, 401),
    );

    await expect(listProjects(ORG_ID)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("reports a network outage as unavailable, never as a logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(listProjects(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("creates a project and returns the backend-generated slug", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { project: projectSummary } }, 201),
    );

    const outcome = await createProject(ORG_ID, {
      name: "Restaurant Website Redesign",
      description: "Website redesign for our client",
    });

    expect(outcome).toEqual({ status: "success", data: projectSummary });
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Restaurant Website Redesign",
      description: "Website redesign for our client",
    });
  });

  it("maps validation failures to the offending fields", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [
            { path: "name", message: "Project name must be at least 2 characters" },
            { path: "unknown", message: "ignored" },
          ],
        },
        400,
      ),
    );

    const outcome = await createProject(ORG_ID, { name: "x" });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.fields).toEqual({
      name: "Project name must be at least 2 characters",
    });
  });

  it("maps a slug conflict", async () => {
    stubFetch(() =>
      jsonResponse({ success: false, code: "CONFLICT", message: "Slug taken" }, 409),
    );

    await expect(createProject(ORG_ID, { name: "Acme" })).resolves.toEqual({
      status: "conflict",
      message: "Slug taken",
    });
  });

  it("does not claim a failed create when the outcome is unknown", async () => {
    // The request may or may not have reached the server, so the caller must
    // reconcile by refreshing rather than retrying blindly.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(createProject(ORG_ID, { name: "Acme" })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a malformed create response as unavailable, not success", async () => {
    stubFetch(() => jsonResponse({ success: true, data: {} }, 201));

    await expect(createProject(ORG_ID, { name: "Acme" })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reads a project by slug, encoding the path segment", async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        success: true,
        data: { project: { ...projectSummary, environments: [environment] } },
      }, 200),
    );

    const outcome = await getProject(ORG_ID, "restaurant/website");

    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/restaurant%2Fwebsite`);
    expect(outcome).toEqual({
      status: "success",
      data: { ...projectSummary, environments: [environment] },
    });
  });

  it("preserves environment ids in the project detail", async () => {
    stubFetch(() =>
      jsonResponse({
        success: true,
        data: { project: { ...projectSummary, environments: [environment] } },
      }, 200),
    );

    const outcome = await getProject(ORG_ID, projectSummary.slug);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    expect(outcome.data.environments[0]?.id).toBe(environment.id);
  });

  it("maps a missing or inaccessible project to not-found", async () => {
    stubFetch(() =>
      jsonResponse({ success: false, code: "NOT_FOUND", message: "Project not found" }, 404),
    );

    await expect(getProject(ORG_ID, "missing")).resolves.toEqual({
      status: "not-found",
    });
  });

  it("patches a project, sending a cleared description as null", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { project: projectSummary } }, 200),
    );

    await updateProject(ORG_ID, projectSummary.slug, { description: null });

    expect(calls[0].init.method).toBe("PATCH");
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${projectSummary.slug}`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ description: null });
  });

  it("creates an environment on the project path", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { environment } }, 201),
    );

    const outcome = await createEnvironment(ORG_ID, projectSummary.slug, {
      name: "Staging",
      url: "https://staging.example.com",
    });

    expect(outcome).toEqual({ status: "success", data: environment });
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${projectSummary.slug}/environments`);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Staging",
      url: "https://staging.example.com",
    });
  });

  it("maps environment field validation errors to url", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [{ path: "url", message: "Enter a website URL" }],
        },
        400,
      ),
    );

    const outcome = await createEnvironment(ORG_ID, projectSummary.slug, {
      name: "Staging",
      url: "not-a-url",
    });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.fields).toEqual({ url: "Enter a website URL" });
  });

  it("patches an environment by id under its parent project", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { environment } }, 200),
    );

    const outcome = await updateEnvironment(
      ORG_ID,
      projectSummary.slug,
      environment.id,
      { url: "https://staging.example.com" },
    );

    expect(new URL(calls[0].url).pathname).toBe(
      `${BASE}/${projectSummary.slug}/environments/${environment.id}`,
    );
    expect(calls[0].init.method).toBe("PATCH");
    expect(outcome).toEqual({ status: "success", data: environment });
  });

  it("maps an environment that escapes its parent project to not-found", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: false, code: "NOT_FOUND", message: "Environment not found" },
        404,
      ),
    );

    await expect(
      updateEnvironment(ORG_ID, projectSummary.slug, environment.id, {
        name: "Prod",
      }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("forbids an action the caller's role does not allow", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: false, code: "FORBIDDEN", message: "Your role does not allow this" },
        403,
      ),
    );

    await expect(createProject(ORG_ID, { name: "Acme" })).resolves.toEqual({
      status: "forbidden",
      message: "Your role does not allow this",
    });
  });
});

describe("response shape validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const projectDetailResponse = (project: unknown) =>
    jsonResponse({ success: true, data: { project } }, 200);

  const projectWithoutSlug = {
    id: projectSummary.id,
    name: projectSummary.name,
    description: projectSummary.description,
    createdAt: projectSummary.createdAt,
    updatedAt: projectSummary.updatedAt,
  };

  const environmentWithoutUrl = {
    id: environment.id,
    name: environment.name,
    slug: environment.slug,
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt,
  };

  it("treats an empty project object as malformed", async () => {
    stubFetch(() => projectDetailResponse({}));

    await expect(getProject(ORG_ID, "slug")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a project missing required fields as malformed", async () => {
    stubFetch(() => projectDetailResponse(projectWithoutSlug));

    await expect(getProject(ORG_ID, "slug")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a project with wrongly typed fields as malformed", async () => {
    stubFetch(() =>
      projectDetailResponse({
        ...projectSummary,
        description: 42,
        updatedAt: 123,
      }),
    );

    await expect(getProject(ORG_ID, "slug")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("accepts a project whose description is null", async () => {
    // A null description is a valid project state, not a malformed field.
    stubFetch(() =>
      projectDetailResponse({
        ...projectSummary,
        description: null,
        environments: [],
      }),
    );

    const outcome = await getProject(ORG_ID, "slug");

    expect(outcome).toMatchObject({ status: "success" });
  });

  it("treats a malformed environment as malformed", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { environment: environmentWithoutUrl } }, 201),
    );

    await expect(
      createEnvironment(ORG_ID, "slug", {
        name: "Staging",
        url: "https://staging.example.com",
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("treats invalid nested environments as malformed", async () => {
    stubFetch(() =>
      projectDetailResponse({
        ...projectSummary,
        environments: [environmentWithoutUrl],
      }),
    );

    await expect(getProject(ORG_ID, "slug")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a non-array environments field as malformed", async () => {
    stubFetch(() =>
      projectDetailResponse({ ...projectSummary, environments: {} }),
    );

    await expect(getProject(ORG_ID, "slug")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a list with an invalid entry as malformed, never an empty list", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { projects: [{}] } }, 200),
    );

    await expect(listProjects(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("treats a non-array projects field as malformed", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { projects: {} } }, 200),
    );

    await expect(listProjects(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("accepts a complete project detail with its environments", async () => {
    stubFetch(() =>
      projectDetailResponse({
        ...projectSummary,
        environments: [environment],
      }),
    );

    const outcome = await getProject(ORG_ID, "slug");

    expect(outcome).toEqual({
      status: "success",
      data: { ...projectSummary, environments: [environment] },
    });
  });
});

describe("prepareProjectUpdate", () => {
  const initial = {
    name: "Restaurant Website Redesign",
    description: "Website redesign for our client",
  };

  it("sends only the name when only the name changed", () => {
    const result = prepareProjectUpdate(initial, {
      name: "Restaurant Website Rebuild",
      description: initial.description,
    });

    expect(result).toEqual({
      ok: true,
      changes: { name: "Restaurant Website Rebuild" },
    });
  });

  it("sends only the description when only the description changed", () => {
    const result = prepareProjectUpdate(initial, {
      name: initial.name,
      description: "New scope for the client site",
    });

    expect(result).toEqual({
      ok: true,
      changes: { description: "New scope for the client site" },
    });
  });

  it("clears an existing description with null", () => {
    const result = prepareProjectUpdate(initial, {
      name: initial.name,
      description: "",
    });

    expect(result).toEqual({ ok: true, changes: { description: null } });
  });

  it("leaves a null description unchanged when nothing was typed", () => {
    const result = prepareProjectUpdate(
      { name: "Cafe Website", description: null },
      { name: "Cafe Website", description: "" },
    );

    expect(result).toEqual({ ok: true, changes: {} });
  });

  it("sends both fields when both changed", () => {
    const result = prepareProjectUpdate(initial, {
      name: "Cafe Website Redesign",
      description: "Now covering the loyalty pages",
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        name: "Cafe Website Redesign",
        description: "Now covering the loyalty pages",
      },
    });
  });

  it("reports no changes when nothing was edited", () => {
    const result = prepareProjectUpdate(initial, { ...initial });

    expect(result).toEqual({ ok: true, changes: {} });
  });

  it("trims whitespace and ignores it when detecting changes", () => {
    const result = prepareProjectUpdate(initial, {
      name: `  ${initial.name}  `,
      description: `  ${initial.description}  `,
    });

    expect(result).toEqual({ ok: true, changes: {} });

    const changed = prepareProjectUpdate(initial, {
      name: "  Restaurant Website Rebuild  ",
      description: "  ",
    });

    expect(changed).toEqual({
      ok: true,
      changes: { name: "Restaurant Website Rebuild", description: null },
    });
  });

  it("rejects a name outside the 2–180 character limits", () => {
    const short = prepareProjectUpdate(initial, { name: "A", description: null });
    expect(short).toEqual({
      ok: false,
      errors: { name: "Project name must be at least 2 characters." },
    });

    const long = prepareProjectUpdate(initial, {
      name: "a".repeat(181),
      description: null,
    });
    expect(long.ok).toBe(false);
    if (long.ok) return;
    expect(long.errors.name).toContain("180");
  });

  it("rejects a description over 2000 characters", () => {
    const result = prepareProjectUpdate(initial, {
      name: initial.name,
      description: "a".repeat(2001),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.description).toContain("2,000");

    const atLimit = prepareProjectUpdate(initial, {
      name: initial.name,
      description: "a".repeat(2000),
    });
    expect(atLimit).toEqual({
      ok: true,
      changes: { description: "a".repeat(2000) },
    });
  });

  it("renames to a two-character name without regenerating a slug", () => {
    // "AB" is too short to derive a slug from, but a rename keeps the
    // existing slug, so the short name is perfectly valid here — and the
    // payload must never carry a slug.
    const result = prepareProjectUpdate(initial, {
      name: "AB",
      description: initial.description,
    });

    expect(result).toEqual({ ok: true, changes: { name: "AB" } });
    if (result.ok) expect(result.changes).not.toHaveProperty("slug");
  });
});

describe("projectDestination", () => {
  it("builds the project URL from the canonical org slug and the backend slug", () => {
    expect(projectDestination("acme-studio", "restaurant-website-redesign")).toBe(
      "/w/acme-studio/projects/restaurant-website-redesign",
    );
  });
});

describe("describeCreateProjectFailure", () => {
  it("shows the backend message and field errors for a rejected creation", () => {
    expect(
      describeCreateProjectFailure({
        status: "rejected",
        message: "Check the project details.",
        fields: { name: "This name is already taken." },
      }),
    ).toEqual({
      kind: "message",
      message: "Check the project details.",
      fields: { name: "This name is already taken." },
    });
  });

  it("shows the backend message when the role forbids creation", () => {
    expect(
      describeCreateProjectFailure({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({ kind: "message", message: "Your role does not allow this" });
  });

  it("shows the backend message for a conflict, so it stays actionable", () => {
    expect(
      describeCreateProjectFailure({
        status: "conflict",
        message: "A project with this URL already exists.",
      }),
    ).toEqual({
      kind: "message",
      message: "A project with this URL already exists.",
    });
  });

  it("shows a generic unavailable state for a missing workspace", () => {
    const failure = describeCreateProjectFailure({ status: "not-found" });

    expect(failure.kind).toBe("message");
    if (failure.kind === "message") {
      expect(failure.message).toContain("not available");
    }
  });

  it("tells the user an unavailable creation could not be confirmed", () => {
    // A POST that failed on a network problem may still have created the
    // project, so the copy must send them to their project list — not invite
    // an automatic resubmission.
    const failure = describeCreateProjectFailure({
      status: "unavailable",
      message: "We could not reach Pinforth.",
    });

    expect(failure.kind).toBe("message");
    if (failure.kind === "message") {
      expect(failure.message).toContain("Check your project list");
    }
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(describeCreateProjectFailure({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });

  it("never produces a success destination for any failure", () => {
    const failures = [
      { status: "rejected", message: "no" },
      { status: "unauthorized" },
      { status: "forbidden", message: "no" },
      { status: "not-found" },
      { status: "conflict", message: "no" },
      { status: "unavailable", message: "no" },
    ] as const;

    for (const outcome of failures) {
      const failure = describeCreateProjectFailure(outcome);

      // The only navigation a failure can request is the sign-in redirect;
      // project navigation is reserved for a confirmed success slug.
      expect(["login", "message"]).toContain(failure.kind);
    }
  });
});

describe("resolveProjectDetailState", () => {
  const projectDetail = { ...projectSummary, environments: [environment] };

  it("maps a successful read to ready with the project", () => {
    expect(
      resolveProjectDetailState({ status: "success", data: projectDetail }),
    ).toEqual({ kind: "ready", project: projectDetail });
  });

  it("maps not-found to a single generic state", () => {
    expect(resolveProjectDetailState({ status: "not-found" })).toEqual({
      kind: "not-found",
    });
  });

  it("maps forbidden to its own state with the backend message", () => {
    expect(
      resolveProjectDetailState({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({ kind: "forbidden", message: "Your role does not allow this" });
  });

  it("maps rejected, conflict and unavailable to a retryable state", () => {
    expect(
      resolveProjectDetailState({
        status: "rejected",
        message: "Bad request.",
      }),
    ).toEqual({ kind: "unavailable", message: "Bad request." });

    expect(
      resolveProjectDetailState({
        status: "conflict",
        message: "Conflicting state.",
      }),
    ).toEqual({ kind: "unavailable", message: "Conflicting state." });

    expect(
      resolveProjectDetailState({
        status: "unavailable",
        message: "We could not reach Pinforth.",
      }),
    ).toEqual({ kind: "unavailable", message: "We could not reach Pinforth." });
  });

  it("maps unauthorized to the sign-in state, never to project data", () => {
    expect(resolveProjectDetailState({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });
});

describe("createRequestGuard", () => {
  it("accepts the newest request only", () => {
    const guard = createRequestGuard();

    const first = guard.start();

    expect(guard.accept(first)).toBe(true);
  });

  it("drops a superseded request when the route parameters change", () => {
    // An organization or project switch mid-flight: the older response must
    // never write state under the newer URL.
    const guard = createRequestGuard();

    const first = guard.start();
    const second = guard.start();

    expect(guard.accept(first)).toBe(false);
    expect(guard.accept(second)).toBe(true);
  });
});

describe("loadProjectDetail", () => {
  it("resolves a complete response to ready", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: true, data: { project: { ...projectSummary, environments: [environment] } } },
        200,
      ),
    );

    await expect(loadProjectDetail(ORG_ID, "slug")).resolves.toEqual({
      kind: "ready",
      project: { ...projectSummary, environments: [environment] },
    });
  });

  it("maps a failed request to unavailable, never to an empty project", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });

    const state = await loadProjectDetail(ORG_ID, "slug");

    expect(state.kind).toBe("unavailable");
  });
});

describe("describeEditProjectFailure", () => {
  it("shows the backend message and field errors for a rejected edit", () => {
    expect(
      describeEditProjectFailure({
        status: "rejected",
        message: "Check the project details.",
        fields: { name: "This name is already taken." },
      }),
    ).toEqual({
      kind: "message",
      message: "Check the project details.",
      fields: { name: "This name is already taken." },
    });
  });

  it("shows the backend message when the role forbids editing", () => {
    expect(
      describeEditProjectFailure({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({ kind: "message", message: "Your role does not allow this" });
  });

  it("shows the backend message for a conflict", () => {
    expect(
      describeEditProjectFailure({
        status: "conflict",
        message: "The project changed elsewhere.",
      }),
    ).toEqual({ kind: "message", message: "The project changed elsewhere." });
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(describeEditProjectFailure({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });

  it("reports a missing or inaccessible project as gone", () => {
    expect(describeEditProjectFailure({ status: "not-found" })).toEqual({
      kind: "gone",
    });
  });

  it("treats an unanswered PATCH as unconfirmed, never as failed", () => {
    // A network failure can hide a PATCH that was applied server-side, so
    // the outcome offers a refresh and forbids an automatic retry.
    expect(
      describeEditProjectFailure({
        status: "unavailable",
        message: "We could not reach Pinforth.",
      }),
    ).toEqual({ kind: "refresh", message: UNCONFIRMED_EDIT_MESSAGE });
  });
});

describe("changesAreLive", () => {
  const project = {
    ...projectSummary,
    environments: [environment],
  };

  it("recognises a landed rename", () => {
    expect(
      changesAreLive({ name: "Restaurant Website Rebuild" }, {
        ...project,
        name: "Restaurant Website Rebuild",
      }),
    ).toBe(true);

    expect(changesAreLive({ name: "Restaurant Website Rebuild" }, project)).toBe(
      false,
    );
  });

  it("recognises a landed description change", () => {
    expect(
      changesAreLive({ description: "New scope" }, {
        ...project,
        description: "New scope",
      }),
    ).toBe(true);

    expect(changesAreLive({ description: "New scope" }, project)).toBe(false);
  });

  it("recognises a landed description clear", () => {
    expect(changesAreLive({ description: null }, {
      ...project,
      description: null,
    })).toBe(true);

    expect(changesAreLive({ description: null }, project)).toBe(false);
  });

  it("treats an empty server description as cleared", () => {
    // The same normalisation the update helper applies on the way out.
    expect(changesAreLive({ description: null }, {
      ...project,
      description: "",
    })).toBe(true);
  });

  it("checks only the fields that were sent", () => {
    expect(changesAreLive({ description: "New scope" }, {
      ...project,
      name: "A Different Name",
      description: "New scope",
    })).toBe(true);
  });

  it("accepts an empty change set — there is nothing to land", () => {
    expect(changesAreLive({}, project)).toBe(true);
  });
});

describe("describeEnvironmentCreateFailure", () => {
  it("shows the backend message and field errors for a rejected creation", () => {
    expect(
      describeEnvironmentCreateFailure({
        status: "rejected",
        message: "Check the environment details.",
        fields: { url: "This URL is already in use." },
      }),
    ).toEqual({
      kind: "message",
      message: "Check the environment details.",
      fields: { url: "This URL is already in use." },
    });
  });

  it("shows the backend message when the role forbids creating", () => {
    expect(
      describeEnvironmentCreateFailure({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({ kind: "message", message: "Your role does not allow this" });
  });

  it("shows the backend message for a conflict", () => {
    expect(
      describeEnvironmentCreateFailure({
        status: "conflict",
        message: "This environment already exists.",
      }),
    ).toEqual({ kind: "message", message: "This environment already exists." });
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(describeEnvironmentCreateFailure({ status: "unauthorized" })).toEqual(
      { kind: "login" },
    );
  });

  it("reports a missing or inaccessible project as gone", () => {
    expect(describeEnvironmentCreateFailure({ status: "not-found" })).toEqual({
      kind: "gone",
    });
  });

  it("treats an unanswered POST as unconfirmed, never as failed", () => {
    // A network failure can hide a POST that was applied server-side, so the
    // outcome offers a refresh and forbids an automatic retry.
    expect(
      describeEnvironmentCreateFailure({
        status: "unavailable",
        message: "We could not reach Pinforth.",
      }),
    ).toEqual({ kind: "refresh", message: UNCONFIRMED_CREATE_MESSAGE });
  });
});

describe("environment reconciliation", () => {
  const project = {
    ...projectSummary,
    environments: [environment],
  };

  it("recognises the created environment by its backend id", () => {
    expect(environmentListed(environment.id, project)).toBe(true);
  });

  it("does not accept an equal name and url as proof of identity", () => {
    // Another id means another environment, whatever its values look like —
    // only the confirmed POST's id is conclusive.
    const twin = { ...environment, id: "9d4e2f1a-5b3c-4a7e-8f0d-2c1b0a9e7d65" };

    expect(environmentListed(twin.id, { ...project, environments: [twin] })).toBe(
      true,
    );
    expect(environmentListed(twin.id, project)).toBe(false);
  });

  it("matches an unconfirmed creation only on exact name and url", () => {
    expect(
      environmentMatches(
        { name: environment.name, url: environment.url },
        project,
      ),
    ).toBe(true);

    expect(
      environmentMatches(
        { name: environment.name, url: "https://another.example.com" },
        project,
      ),
    ).toBe(false);

    expect(
      environmentMatches(
        { name: "Production", url: environment.url },
        project,
      ),
    ).toBe(false);
  });
});

/**
 * Environment editing: the partial-update preparer, the PATCH failure mapper
 * and the reconciliation comparator. Mirrors the project-edit suites — pure
 * helpers, no fetch.
 */

describe("prepareEnvironmentUpdate", () => {
  const initial = { name: environment.name, url: environment.url };

  it("sends only the name when only the name changed", () => {
    expect(
      prepareEnvironmentUpdate(initial, {
        name: "Staging 2",
        url: initial.url,
      }),
    ).toEqual({ name: "Staging 2" });
  });

  it("sends only the url when only the url changed", () => {
    expect(
      prepareEnvironmentUpdate(initial, {
        name: initial.name,
        url: "https://qa.example.com",
      }),
    ).toEqual({ url: "https://qa.example.com" });
  });

  it("sends both fields when both changed", () => {
    expect(
      prepareEnvironmentUpdate(initial, {
        name: "Preview",
        url: "https://preview.example.com",
      }),
    ).toEqual({
      name: "Preview",
      url: "https://preview.example.com",
    });
  });

  it("returns an empty change set when nothing changed", () => {
    // The page must not issue a PATCH at all for this result.
    expect(prepareEnvironmentUpdate(initial, { ...initial })).toEqual({});
  });

  it("trims values, and whitespace-only differences are not changes", () => {
    expect(
      prepareEnvironmentUpdate(initial, {
        name: "  Staging 2  ",
        url: "  https://qa.example.com  ",
      }),
    ).toEqual({
      name: "Staging 2",
      url: "https://qa.example.com",
    });

    expect(
      prepareEnvironmentUpdate(initial, {
        name: ` ${initial.name} `,
        url: ` ${initial.url} `,
      }),
    ).toEqual({});
  });

  it("never puts the id, slug or project identity in the body", () => {
    // The id addresses the PATCH request; it is never part of its payload.
    const changes = prepareEnvironmentUpdate(initial, {
      name: "Staging 2",
      url: "https://qa.example.com",
    });

    expect(Object.keys(changes).sort()).toEqual(["name", "url"]);
  });
});

describe("describeEnvironmentEditFailure", () => {
  it("shows the backend message and field errors for a rejected edit", () => {
    expect(
      describeEnvironmentEditFailure({
        status: "rejected",
        message: "Check the environment details.",
        fields: { url: "Enter a valid HTTP or HTTPS URL." },
      }),
    ).toEqual({
      kind: "message",
      message: "Check the environment details.",
      fields: { url: "Enter a valid HTTP or HTTPS URL." },
    });
  });

  it("shows the backend message for a forbidden edit", () => {
    expect(
      describeEnvironmentEditFailure({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({ kind: "message", message: "Your role does not allow this" });
  });

  it("shows the backend message for a conflict", () => {
    expect(
      describeEnvironmentEditFailure({
        status: "conflict",
        message: "The environment changed elsewhere.",
      }),
    ).toEqual({
      kind: "message",
      message: "The environment changed elsewhere.",
    });
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(describeEnvironmentEditFailure({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });

  it("reports a missing or inaccessible project or environment as gone", () => {
    expect(describeEnvironmentEditFailure({ status: "not-found" })).toEqual({
      kind: "gone",
    });
  });

  it("treats an unanswered PATCH as unconfirmed, never as failed", () => {
    // A network failure can hide a PATCH that was applied server-side, so
    // the message says so and asks for a GET — it never claims failure and
    // never authorises an automatic retry.
    expect(
      describeEnvironmentEditFailure({
        status: "unavailable",
        message: "The project service is unreachable.",
      }),
    ).toEqual({
      kind: "refresh",
      message: UNCONFIRMED_ENVIRONMENT_EDIT_MESSAGE,
    });
  });
});

describe("environmentChangesAreLive", () => {
  it("confirms a saved name against the refreshed environment", () => {
    expect(
      environmentChangesAreLive(
        { name: "Staging 2" },
        { ...environment, name: "Staging 2" },
      ),
    ).toBe(true);
  });

  it("flags a refreshed environment that still shows the old name", () => {
    // Not proof the PATCH failed — the read may simply be behind, so the
    // page keeps its values and its refresh offer.
    expect(
      environmentChangesAreLive({ name: "Staging 2" }, environment),
    ).toBe(false);
  });

  it("checks only the fields that were sent", () => {
    expect(
      environmentChangesAreLive(
        { url: "https://qa.example.com" },
        {
          ...environment,
          name: "Renamed Elsewhere",
          url: "https://qa.example.com",
        },
      ),
    ).toBe(true);
  });

  it("accepts an empty change set — there is nothing to land", () => {
    expect(environmentChangesAreLive({}, environment)).toBe(true);
  });
});

describe("describeCreationFollowUp", () => {
  it("distinguishes a listed-but-missing environment from an unreadable read-back", () => {
    expect(describeCreationFollowUp(true, "listed-missing")).toBe(
      ENVIRONMENT_CREATED_NOT_SHOWN_MESSAGE,
    );

    expect(describeCreationFollowUp(true, "unreadable")).toBe(
      ENVIRONMENT_CREATED_DETAILS_NOT_LOADED_MESSAGE,
    );
  });

  it("never claims anything about an unconfirmed POST", () => {
    expect(describeCreationFollowUp(false, "listed-missing")).toBe(
      UNCONFIRMED_CREATE_MESSAGE,
    );
    expect(describeCreationFollowUp(false, "unreadable")).toBe(
      UNCONFIRMED_CREATE_MESSAGE,
    );
  });
});

describe("createEnvironmentEditState", () => {
  it("starts idle, tied to its request key and environment id", () => {
    expect(createEnvironmentEditState("org|project", environment.id)).toEqual({
      key: "org|project",
      environmentId: environment.id,
      phase: "editing",
      changes: null,
      patchConfirmed: false,
      message: null,
      fields: null,
      offerRefresh: false,
      sessionExpired: false,
    });
  });
});

/**
 * The project list route: how a `listProjects` outcome becomes a renderable
 * state, and how the page pattern (guard + request key) keeps a superseded
 * organization's response from ever writing state.
 */

describe("resolveProjectListState", () => {
  it("keeps a confirmed populated list as ready, passing backend slugs through", () => {
    // The ready projects carry the backend-returned slugs untouched — they
    // are what the list rows build their detail links from.
    expect(
      resolveProjectListState({ status: "success", data: [projectSummary] }),
    ).toEqual({ kind: "ready", projects: [projectSummary] });
  });

  it("keeps a confirmed empty list as ready — the only source of “No projects yet.”", () => {
    expect(resolveProjectListState({ status: "success", data: [] })).toEqual({
      kind: "ready",
      projects: [],
    });
  });

  it("maps a 404 to not-found, never to an empty list", () => {
    expect(resolveProjectListState({ status: "not-found" })).toEqual({
      kind: "not-found",
    });
  });

  it("maps a forbidden list to forbidden with the backend message", () => {
    expect(
      resolveProjectListState({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({
      kind: "forbidden",
      message: "Your role does not allow this",
    });
  });

  it("maps an outage to unavailable — retryable, and never a logout", () => {
    expect(
      resolveProjectListState({ status: "unavailable", message: "down" }),
    ).toEqual({ kind: "unavailable", message: "down" });
  });

  it("treats a rejected or conflicting GET as unavailable, not as an empty list", () => {
    expect(
      resolveProjectListState({ status: "rejected", message: "nope" }).kind,
    ).toBe("unavailable");
    expect(
      resolveProjectListState({ status: "conflict", message: "nope" }).kind,
    ).toBe("unavailable");
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(resolveProjectListState({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });
});

describe("loadProjectList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the organization's project endpoint by backend id", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { projects: [projectSummary] } }, 200),
    );

    await expect(loadProjectList(ORG_ID)).resolves.toEqual({
      kind: "ready",
      projects: [projectSummary],
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("issues a fresh GET on every call, so Retry never reuses a response", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { projects: [] } }, 200),
    );

    await loadProjectList(ORG_ID);
    await loadProjectList(ORG_ID);

    expect(calls).toHaveLength(2);
  });

  it("maps a 404 to not-found, never to an empty list", async () => {
    stubFetch(() =>
      jsonResponse({ success: false, code: "NOT_FOUND", message: "no" }, 404),
    );

    await expect(loadProjectList(ORG_ID)).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("maps a network failure to unavailable, never to login or empty", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(loadProjectList(ORG_ID)).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("maps a forbidden list to forbidden with the backend message", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "FORBIDDEN",
          message: "Your role does not allow this",
        },
        403,
      ),
    );

    await expect(loadProjectList(ORG_ID)).resolves.toEqual({
      kind: "forbidden",
      message: "Your role does not allow this",
    });
  });

  it("never writes a superseded organization's late response", async () => {
    // Mirrors the page: an org switch mid-flight starts a second request,
    // and only the newest token may write state. Both responses arrive
    // afterwards; the older one must be dropped, so one workspace's project
    // list can never render under another.
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const guard = createRequestGuard();
    const writes: Array<{ token: number; state: ProjectListState }> = [];

    const request = (orgId: string) => {
      const token = guard.start();
      return loadProjectList(orgId).then((state) => {
        if (guard.accept(token)) writes.push({ token, state });
      });
    };

    const oldRequest = request(ORG_ID);
    const newRequest = request("9d8c7b6a-5e4f-4a3b-2c1d-0e9f8a7b6c5d");

    // Let both requests reach the network before answering either.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvers).toHaveLength(2);
    // Each request addressed its own organization by backend id.
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(BASE);
    expect(new URL(String(fetchMock.mock.calls[1][0])).pathname).toBe(
      "/api/v1/organizations/9d8c7b6a-5e4f-4a3b-2c1d-0e9f8a7b6c5d/projects",
    );

    resolvers[0](jsonResponse({ success: true, data: { projects: [projectSummary] } }, 200));
    resolvers[1](
      jsonResponse(
        {
          success: true,
          data: {
            projects: [{ ...projectSummary, slug: "other-workspace-project", name: "Other" }],
          },
        },
        200,
      ),
    );

    await Promise.all([oldRequest, newRequest]);

    // Only the newest request wrote, and it wrote its own workspace's data.
    expect(writes).toHaveLength(1);
    expect(writes[0].state).toMatchObject({
      kind: "ready",
      projects: [{ slug: "other-workspace-project" }],
    });
  });
});
