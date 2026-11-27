import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeployment, listDeployments, type Deployment, type DeploymentPage } from "@/lib/deployments/api";
import {
  deploymentMatches,
  findRecordedDeployment,
  mergeDeploymentPages,
  newestDeployment,
  prepareDeployment,
} from "@/lib/deployments/deployment-values";
import { getProject } from "@/lib/projects/api";

/** Pins docs/contracts/deployments-v1.md. */

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const ENV_ID = "4c424a52-c380-4cf8-a968-380d3211516e";
const BASE = `/api/v1/organizations/${ORG_ID}/projects/site/environments/${ENV_ID}/deployments`;

const deployment = (over: Partial<Deployment> = {}): Deployment => ({
  id: "d-1",
  environmentId: ENV_ID,
  label: "v1.5",
  commitSha: "a1b2c3d",
  url: "https://staging.example.com",
  notes: null,
  createdBy: { id: "u-1", name: "Priya" },
  createdAt: "2026-11-26T10:15:30.000Z",
  ...over,
});

function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("deployment client", () => {
  it("lists newest first with a cursor", async () => {
    const calls = stubFetch({ success: true, data: { deployments: [deployment()], nextCursor: "next" } });
    expect(await listDeployments(ORG_ID, "site", ENV_ID, "prev", 100)).toEqual({
      status: "success",
      data: { deployments: [deployment()], nextCursor: "next" },
    });
    expect(calls[0].url).toContain(`${BASE}?limit=100&cursor=prev`);
  });

  it("treats a malformed list as unavailable, never as empty", async () => {
    stubFetch({ success: true, data: { deployments: [{ id: "d-1" }], nextCursor: null } });
    expect((await listDeployments(ORG_ID, "site", ENV_ID, null)).status).toBe("unavailable");
    stubFetch({ success: true, data: { nextCursor: null } });
    expect((await listDeployments(ORG_ID, "site", ENV_ID, null)).status).toBe("unavailable");
  });

  it("creates, and names a taken label apart from other conflicts", async () => {
    const calls = stubFetch({ success: true, data: { deployment: deployment() } }, 201);
    const input = { label: "v1.5", commitSha: null, url: null, notes: null };
    expect(await createDeployment(ORG_ID, "site", ENV_ID, input)).toEqual({ status: "success", data: deployment() });
    expect(calls[0].init).toMatchObject({ method: "POST", body: JSON.stringify(input) });

    stubFetch({ success: false, code: "DEPLOYMENT_LABEL_TAKEN", message: "Taken" }, 409);
    expect(await createDeployment(ORG_ID, "site", ENV_ID, input)).toEqual({ status: "conflict", message: "Taken", labelTaken: true });
  });

  it("maps field errors, and treats an outage as an unknown outcome", async () => {
    const input = { label: "v1.5" };
    stubFetch({ success: false, code: "VALIDATION_ERROR", message: "Bad", details: [{ path: "commitSha", message: "Not hex" }] }, 400);
    expect(await createDeployment(ORG_ID, "site", ENV_ID, input)).toEqual({ status: "rejected", message: "Bad", fields: { commitSha: "Not hex" } });

    stubFetch({ success: false, code: "INTERNAL_ERROR", message: "Oops" }, 500);
    expect((await createDeployment(ORG_ID, "site", ENV_ID, input)).status).toBe("unavailable");
  });

  it("reads the latest deployment on each environment of a project", async () => {
    const environment = {
      id: ENV_ID, name: "Staging", slug: "staging", url: "https://staging.example.com",
      createdAt: "2026-11-02T09:00:00.000Z", updatedAt: "2026-11-02T09:00:00.000Z",
    };
    const project = (latestDeployment: unknown) => ({
      success: true,
      data: {
        project: {
          id: "p", name: "Site", slug: "site", description: null,
          createdAt: "2026-11-01T09:00:00.000Z", updatedAt: "2026-11-01T09:00:00.000Z",
          environments: [{ ...environment, latestDeployment }],
        },
      },
    });
    const latest = { id: "d-1", label: "v1.5", createdAt: "2026-11-26T10:15:30.000Z" };

    stubFetch(project(latest));
    const read = await getProject(ORG_ID, "site");
    expect(read.status === "success" && read.data.environments[0].latestDeployment).toEqual(latest);
    stubFetch(project(null));
    expect((await getProject(ORG_ID, "site")).status).toBe("success");
    stubFetch(project({ id: "d-1" }));
    expect((await getProject(ORG_ID, "site")).status).toBe("unavailable");
  });
});

describe("recording a deployment", () => {
  it("validates like the API and sends blanks as null", () => {
    expect(prepareDeployment({ label: " v1.5 ", commitSha: " ", url: "", notes: "  " })).toEqual({
      input: { label: "v1.5", commitSha: null, url: null, notes: null },
    });
    expect(prepareDeployment({ label: "  ", commitSha: "", url: "", notes: "" })).toEqual({ errors: { label: expect.any(String) } });
    expect(Object.keys((prepareDeployment({ label: "v1", commitSha: "xyz", url: "", notes: "" }) as { errors: object }).errors)).toEqual(["commitSha"]);
    expect("errors" in prepareDeployment({ label: "v1", commitSha: "", url: "https://u:p@staging.example.com", notes: "" })).toBe(true);
    expect("errors" in prepareDeployment({ label: "v1", commitSha: "", url: "javascript:alert(1)", notes: "" })).toBe(true);
  });

  it("matches a stored deployment on every submitted field", () => {
    const input = { label: "v1.5", commitSha: "A1B2C3D", url: "https://staging.example.com", notes: null };
    expect(deploymentMatches(deployment(), input)).toBe(true);
    expect(deploymentMatches(deployment({ notes: "Other" }), input)).toBe(false);
    expect(deploymentMatches(deployment({ label: "V1.5" }), input)).toBe(false);
  });

  const page = (deployments: Deployment[], nextCursor: string | null) =>
    ({ status: "success", data: { deployments, nextCursor } }) as const;
  const input = { label: "v1.5", commitSha: "a1b2c3d", url: "https://staging.example.com", notes: null };

  it("finds an unconfirmed create by walking the history, and never writes", async () => {
    const fetchPage = vi.fn(async (cursor: string | null) =>
      cursor === null ? page([deployment({ id: "d-2", label: "v1.6" })], "p2") : page([deployment()], null),
    );
    expect(await findRecordedDeployment(fetchPage, input)).toEqual({ kind: "recorded", deployment: deployment() });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("tells a different record and a missing one apart", async () => {
    expect((await findRecordedDeployment(async () => page([deployment({ notes: "Else" })], null), input)).kind).toBe("different");
    expect((await findRecordedDeployment(async () => page([], null), input)).kind).toBe("missing");
  });

  it("stays unknown when the history can't be read", async () => {
    expect((await findRecordedDeployment(async () => ({ status: "unavailable", message: "x" }), input)).kind).toBe("unknown");
    expect((await findRecordedDeployment(async () => ({ status: "unauthorized" }), input)).kind).toBe("login");
  });
});

describe("history helpers", () => {
  it("picks the newest like the API, falling back to id", () => {
    const a = { id: "a", label: "v1", createdAt: "2026-11-26T10:00:00.000Z" };
    const b = { id: "b", label: "v2", createdAt: "2026-11-26T11:00:00.000Z" };
    expect(newestDeployment(a, b)).toBe(b);
    expect(newestDeployment(a, { ...b, createdAt: a.createdAt })).toEqual({ ...b, createdAt: a.createdAt });
    expect(newestDeployment(null, a)).toBe(a);
    expect(newestDeployment(undefined, null)).toBeNull();
  });

  it("appends an older page without repeats", () => {
    const first: DeploymentPage = { deployments: [deployment({ id: "1" })], nextCursor: "c" };
    const next: DeploymentPage = { deployments: [deployment({ id: "1" }), deployment({ id: "2" })], nextCursor: null };
    expect(mergeDeploymentPages(first, next).deployments.map((d) => d.id)).toEqual(["1", "2"]);
  });
});
