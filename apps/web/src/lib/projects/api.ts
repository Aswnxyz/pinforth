import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * The project and environment API client.
 *
 * The only place in the frontend that talks to the project endpoints. It
 * reuses `apiFetch`, so credentials, the single 401 → refresh → retry flow
 * and network-error normalisation are inherited rather than reimplemented.
 *
 * Requests address the organization by its backend **id** (from the
 * workspace context), never by its URL slug.
 *
 * shortcut: these types mirror the agreed ProjectSummary/ProjectDetail/
 * Environment contracts; replaced by the @pinforth/shared exports when the
 * shared project schemas land (Sachin's PR), keeping the same fields.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  name: string;
  slug: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** The detail read carries the project's environments. */
export interface ProjectDetail extends ProjectSummary {
  environments: Environment[];
}

/** The fields a backend validation error can be attributed to. */
export type ProjectField = "name" | "description";
export type EnvironmentField = "name" | "url";

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  /** `null` clears the description; omitted leaves it unchanged. */
  description?: string | null;
}

export interface CreateEnvironmentInput {
  name: string;
  url: string;
}

export type UpdateEnvironmentInput = Partial<CreateEnvironmentInput>;

/**
 * The outcome of a project or environment request.
 *
 * Kept separate from success on purpose, mirroring the organization client:
 * `unauthorized` means the session is over; `unavailable` says nothing about
 * it (outage, or a response that could not be read); `not-found` covers both
 * missing and inaccessible resources, exactly like the API.
 */
export type ProjectApiOutcome<Field extends string, Data> =
  | { status: "success"; data: Data }
  | { status: "rejected"; message: string; fields?: Partial<Record<Field, string>> }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "not-found" }
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string };

const MALFORMED_MESSAGE =
  "Pinforth received an unexpected response. Please refresh and try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Runtime shape guards for successful responses.
 *
 * Each verifies the minimum structure the contract requires — an empty
 * object or a wrong field type is malformed, not a success. They live here
 * rather than in a validation library because this is the only place that
 * needs them.
 */
function isEnvironment(value: unknown): value is Environment {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.slug) &&
    isString(value.url) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function hasProjectFields(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.slug) &&
    (value.description === null || isString(value.description)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isProjectDetail(value: unknown): value is ProjectDetail {
  return (
    isRecord(value) &&
    Array.isArray(value.environments) &&
    value.environments.every(isEnvironment) &&
    hasProjectFields(value)
  );
}

function isProjectList(value: unknown): value is ProjectSummary[] {
  return Array.isArray(value) && value.every(hasProjectFields);
}

/**
 * Maps one API response to an outcome.
 *
 * A successful status with an unreadable body is `unavailable`, never a
 * success — a 200/201 without the expected payload must not be treated as a
 * completed mutation, and a failed list request must never look like an
 * empty list.
 */
function mapApiOutcome<Field extends string, Data>(
  res: ApiResult<unknown>,
  dataKey: "projects" | "project" | "environment",
  fieldNames: readonly Field[],
  isData: (value: unknown) => value is Data,
): ProjectApiOutcome<Field, Data> {
  if (res.ok) {
    const value = isRecord(res.data) ? res.data[dataKey] : undefined;

    if (!isData(value)) {
      return { status: "unavailable", message: MALFORMED_MESSAGE };
    }

    return { status: "success", data: value };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 403) return { status: "forbidden", message: res.message };
  if (res.status === 409) return { status: "conflict", message: res.message };

  if (res.code === "VALIDATION_ERROR" && Array.isArray(res.details)) {
    const fields: Partial<Record<Field, string>> = {};

    for (const detail of res.details as Array<{ path: unknown; message: unknown }>) {
      if (typeof detail.path !== "string" || typeof detail.message !== "string") {
        continue;
      }
      if ((fieldNames as readonly string[]).includes(detail.path)) {
        fields[detail.path as Field] ??= detail.message;
      }
    }

    if (Object.keys(fields).length > 0) {
      return { status: "rejected", message: res.message, fields };
    }
  }

  // Status 0 is a network failure, which means the request may or may not
  // have completed. Creation outcomes are therefore uncertain: the caller
  // refreshes project data to reconcile before retrying anything.
  if (res.status === 0) {
    return { status: "unavailable", message: res.message };
  }

  return { status: "rejected", message: res.message };
}

const PROJECT_FIELDS: readonly ProjectField[] = ["name", "description"];
const ENVIRONMENT_FIELDS: readonly EnvironmentField[] = ["name", "url"];

const projectsPath = (orgId: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects`;

const projectPath = (orgId: string, projectSlug: string) =>
  `${projectsPath(orgId)}/${encodeURIComponent(projectSlug)}`;

const environmentsPath = (orgId: string, projectSlug: string) =>
  `${projectPath(orgId, projectSlug)}/environments`;

export async function listProjects(
  orgId: string,
): Promise<ProjectApiOutcome<ProjectField, ProjectSummary[]>> {
  const res = await apiFetch(projectsPath(orgId), { method: "GET" });

  return mapApiOutcome(res, "projects", PROJECT_FIELDS, isProjectList);
}

export async function createProject(
  orgId: string,
  input: CreateProjectInput,
): Promise<ProjectApiOutcome<ProjectField, ProjectSummary>> {
  const res = await apiFetch(projectsPath(orgId), {
    method: "POST",
    body: JSON.stringify(input),
  });

  return mapApiOutcome<ProjectField, ProjectSummary>(
    res,
    "project",
    PROJECT_FIELDS,
    hasProjectFields,
  );
}

export async function getProject(
  orgId: string,
  projectSlug: string,
): Promise<ProjectApiOutcome<ProjectField, ProjectDetail>> {
  const res = await apiFetch(projectPath(orgId, projectSlug), { method: "GET" });

  return mapApiOutcome<ProjectField, ProjectDetail>(
    res,
    "project",
    PROJECT_FIELDS,
    isProjectDetail,
  );
}

export async function updateProject(
  orgId: string,
  projectSlug: string,
  input: UpdateProjectInput,
): Promise<ProjectApiOutcome<ProjectField, ProjectSummary>> {
  const res = await apiFetch(projectPath(orgId, projectSlug), {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return mapApiOutcome<ProjectField, ProjectSummary>(
    res,
    "project",
    PROJECT_FIELDS,
    hasProjectFields,
  );
}

export async function createEnvironment(
  orgId: string,
  projectSlug: string,
  input: CreateEnvironmentInput,
): Promise<ProjectApiOutcome<EnvironmentField, Environment>> {
  const res = await apiFetch(environmentsPath(orgId, projectSlug), {
    method: "POST",
    body: JSON.stringify(input),
  });

  return mapApiOutcome<EnvironmentField, Environment>(
    res,
    "environment",
    ENVIRONMENT_FIELDS,
    isEnvironment,
  );
}

export async function updateEnvironment(
  orgId: string,
  projectSlug: string,
  environmentId: string,
  input: UpdateEnvironmentInput,
): Promise<ProjectApiOutcome<EnvironmentField, Environment>> {
  const res = await apiFetch(
    `${environmentsPath(orgId, projectSlug)}/${encodeURIComponent(environmentId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

  return mapApiOutcome<EnvironmentField, Environment>(
    res,
    "environment",
    ENVIRONMENT_FIELDS,
    isEnvironment,
  );
}
