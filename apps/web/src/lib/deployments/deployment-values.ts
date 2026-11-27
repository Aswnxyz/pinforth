import { createDeploymentSchema } from "@pinforth/shared";
import {
  DEPLOYMENT_FIELDS,
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentApiOutcome,
  type DeploymentField,
  type DeploymentFieldErrors,
  type DeploymentPage,
  type LatestDeployment,
} from "./api";

export interface DeploymentValues {
  label: string;
  commitSha: string;
  url: string;
  notes: string;
}

export const EMPTY_DEPLOYMENT_VALUES: DeploymentValues = { label: "", commitSha: "", url: "", notes: "" };

/** Validates with the API's own schema; blank optional fields become null. */
export function prepareDeployment(
  values: DeploymentValues,
): { input: CreateDeploymentInput } | { errors: DeploymentFieldErrors } {
  const result = createDeploymentSchema.safeParse(values);
  if (result.success) return { input: result.data };

  const errors: DeploymentFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]) as DeploymentField;
    if ((DEPLOYMENT_FIELDS as readonly string[]).includes(field)) errors[field] ??= issue.message;
  }
  return { errors };
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/** Whether a stored deployment is exactly what was submitted. */
export function deploymentMatches(deployment: Deployment, input: CreateDeploymentInput): boolean {
  return (
    deployment.label === input.label &&
    same(deployment.commitSha?.toLowerCase(), input.commitSha?.toLowerCase()) &&
    same(deployment.url, input.url) &&
    same(deployment.notes, input.notes)
  );
}

export type ReadBack =
  | { kind: "recorded"; deployment: Deployment }
  /** The label exists, but not with what was submitted. */
  | { kind: "different"; deployment: Deployment }
  | { kind: "missing" }
  | { kind: "login" }
  | { kind: "gone" }
  | { kind: "unknown" };

/** A safety stop, far above any real environment's history. */
const MAX_PAGES = 50;

/**
 * Finds a submitted label in the environment's history (contract §11). Labels
 * are unique per environment and compared exactly, so the first hit decides.
 * Never creates anything.
 */
export async function findRecordedDeployment(
  fetchPage: (cursor: string | null) => Promise<DeploymentApiOutcome<DeploymentPage>>,
  input: CreateDeploymentInput,
): Promise<ReadBack> {
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const outcome = await fetchPage(cursor);
    if (outcome.status === "unauthorized") return { kind: "login" };
    if (outcome.status === "not-found") return { kind: "gone" };
    if (outcome.status !== "success") return { kind: "unknown" };

    const found = outcome.data.deployments.find((deployment) => deployment.label === input.label);
    if (found) {
      return deploymentMatches(found, input)
        ? { kind: "recorded", deployment: found }
        : { kind: "different", deployment: found };
    }
    if (outcome.data.nextCursor === null) return { kind: "missing" };
    cursor = outcome.data.nextCursor;
  }

  return { kind: "unknown" };
}

export const unconfirmedRecordMessage = (label: string) =>
  `We couldn’t confirm whether “${label}” was recorded. Check before trying again, so it isn’t recorded twice.`;

export const labelTakenMessage = (label: string) =>
  `This environment already has a deployment called “${label}” with different details. Use a different label.`;

/** Orders like the API: newest `createdAt`, then the larger id. */
export function newestDeployment<T extends LatestDeployment>(
  a: T | null | undefined,
  b: T | null | undefined,
): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const at = Date.parse(a.createdAt);
  const bt = Date.parse(b.createdAt);
  if (at !== bt) return at > bt ? a : b;
  return a.id > b.id ? a : b;
}

/** "a1b2c3d" from a full SHA, for display. */
export const shortSha = (sha: string) => sha.slice(0, 7);

/** Two deployments can land on the same day, so the time is shown too. */
export const formatDeploymentTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Appends an older page; keyset paging shouldn't repeat rows, but one never shows twice. */
export function mergeDeploymentPages(current: DeploymentPage, next: DeploymentPage): DeploymentPage {
  const seen = new Set(current.deployments.map((deployment) => deployment.id));
  return {
    deployments: [...current.deployments, ...next.deployments.filter((deployment) => !seen.has(deployment.id))],
    nextCursor: next.nextCursor,
  };
}
