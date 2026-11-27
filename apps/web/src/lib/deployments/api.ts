import type { CreateDeploymentInput, Deployment, LatestDeployment } from "@pinforth/shared";
import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * The deployment API client: docs/contracts/deployments-v1.md.
 *
 * Deployments are immutable, so there is only create, list and read. A
 * successful status with an unreadable body is `unavailable`, never a
 * success, and a failed list never looks like an empty one.
 */
export type { CreateDeploymentInput, Deployment, LatestDeployment };

export interface DeploymentPage {
  deployments: Deployment[];
  nextCursor: string | null;
}

export const DEPLOYMENT_FIELDS = ["label", "commitSha", "url", "notes"] as const;
export type DeploymentField = (typeof DEPLOYMENT_FIELDS)[number];
export type DeploymentFieldErrors = Partial<Record<DeploymentField, string>>;

export type DeploymentApiOutcome<Data> =
  | { status: "success"; data: Data }
  | { status: "rejected"; message: string; fields?: DeploymentFieldErrors }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "not-found" }
  /** `labelTaken` is the 409 DEPLOYMENT_LABEL_TAKEN. */
  | { status: "conflict"; message: string; labelTaken: boolean }
  /** The request may or may not have landed. */
  | { status: "unavailable"; message: string };

/** The largest page the API serves. */
export const DEPLOYMENT_PAGE_LIMIT = 100;

const MALFORMED_MESSAGE = "Pinforth received an unexpected response. Please refresh and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

export function isLatestDeployment(value: unknown): value is LatestDeployment {
  return isRecord(value) && isString(value.id) && isString(value.label) && isString(value.createdAt);
}

export function isDeployment(value: unknown): value is Deployment {
  return (
    isLatestDeployment(value) &&
    isRecord(value) &&
    isString(value.environmentId) &&
    isNullableString(value.commitSha) &&
    isNullableString(value.url) &&
    isNullableString(value.notes) &&
    (value.createdBy === null ||
      (isRecord(value.createdBy) && isString(value.createdBy.id) && isNullableString(value.createdBy.name)))
  );
}

function isDeploymentPage(value: unknown): value is DeploymentPage {
  return (
    isRecord(value) &&
    Array.isArray(value.deployments) &&
    value.deployments.every(isDeployment) &&
    isNullableString(value.nextCursor)
  );
}

function fieldErrorsFrom(details: unknown): DeploymentFieldErrors | undefined {
  if (!Array.isArray(details)) return undefined;
  const fields: DeploymentFieldErrors = {};

  for (const detail of details) {
    if (!isRecord(detail) || !isString(detail.path) || !isString(detail.message)) continue;
    if ((DEPLOYMENT_FIELDS as readonly string[]).includes(detail.path)) {
      fields[detail.path as DeploymentField] ??= detail.message;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function mapOutcome<Data>(
  res: ApiResult<unknown>,
  pick: (data: unknown) => unknown,
  isData: (value: unknown) => value is Data,
): DeploymentApiOutcome<Data> {
  if (res.ok) {
    const data = pick(res.data);
    return isData(data) ? { status: "success", data } : { status: "unavailable", message: MALFORMED_MESSAGE };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", message: res.message };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 409) {
    return { status: "conflict", message: res.message, labelTaken: res.code === "DEPLOYMENT_LABEL_TAKEN" };
  }
  // A network failure or an outage: the create may or may not have landed.
  if (res.status === 0 || res.status >= 500) return { status: "unavailable", message: res.message };

  const fields = fieldErrorsFrom(res.details);
  return { status: "rejected", message: res.message, ...(fields ? { fields } : {}) };
}

const deploymentsPath = (orgId: string, projectSlug: string, environmentId: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectSlug)}` +
  `/environments/${encodeURIComponent(environmentId)}/deployments`;

/** Newest first. Pass the previous page's `nextCursor` to continue. */
export async function listDeployments(
  orgId: string,
  projectSlug: string,
  environmentId: string,
  cursor: string | null,
  limit = 20,
): Promise<DeploymentApiOutcome<DeploymentPage>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const res = await apiFetch(`${deploymentsPath(orgId, projectSlug, environmentId)}?${params}`, { method: "GET" });
  return mapOutcome(res, (data) => data, isDeploymentPage);
}

export async function createDeployment(
  orgId: string,
  projectSlug: string,
  environmentId: string,
  input: CreateDeploymentInput,
): Promise<DeploymentApiOutcome<Deployment>> {
  const res = await apiFetch(deploymentsPath(orgId, projectSlug, environmentId), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, (data) => (isRecord(data) ? data.deployment : undefined), isDeployment);
}
