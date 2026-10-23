import type { OrganizationRole } from "@pinforth/shared";
import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * Organization API client.
 *
 * This is the only place in the frontend that talks to the organization
 * endpoints. It reuses the existing `apiFetch` infrastructure, so
 * `credentials: "include"` and the single 401 → refresh → retry flow are
 * inherited rather than reimplemented.
 *
 * The session lives entirely in the API's HttpOnly cookies, which are scoped
 * to the API's `/api` path. The Next.js server therefore cannot read them, so
 * every call here is made from the browser.
 */

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  /** The signed-in user's role in this organization. */
  role: OrganizationRole;
  /** The organization's creation date. Not the user's join date. */
  createdAt: string;
  updatedAt: string;
}

/** Fields the backend can attribute an error to. */
export type OrganizationField = "name" | "slug";

/** How each role is shown to a person. */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export interface CreateOrganizationInput {
  name: string;
  /** Optional. When omitted the backend derives a slug from the name. */
  slug?: string;
}

/**
 * The organization list resolved to one of four states.
 *
 * `unauthorized` is kept separate from `error` on purpose: a failed request
 * must never be mistaken for an empty list, because "no organizations" means
 * "start onboarding" while "error" means "offer a retry".
 */
export type OrganizationsOutcome =
  | { status: "success"; organizations: OrganizationSummary[] }
  | { status: "unauthorized" }
  | { status: "error"; message: string };

export type CreateOrganizationOutcome =
  | { status: "success"; organization: OrganizationSummary }
  | { status: "rejected"; message: string; fields?: Partial<Record<OrganizationField, string>> }
  /** The session could not be refreshed; the caller should send the user to sign in. */
  | { status: "unauthorized" }
  /** The request could not be completed at all (offline, service down, unreadable response). */
  | { status: "unavailable"; message: string };

type ListResponse = { organizations: OrganizationSummary[] };
type CreateResponse = { organization: OrganizationSummary };

function isFieldDetails(details: unknown): details is { field: string } {
  return (
    typeof details === "object" &&
    details !== null &&
    "field" in details &&
    typeof (details as { field: unknown }).field === "string"
  );
}

/**
 * Maps the list response to an outcome.
 *
 * A successful response that carries no organizations list is an error, not an
 * empty list — the two lead to different screens.
 */
export function mapListOutcome(res: ApiResult<ListResponse>): OrganizationsOutcome {
  if (res.ok) {
    const organizations = res.data?.organizations;

    if (!organizations) {
      return {
        status: "error",
        message: "The workspace list could not be read. Please try again.",
      };
    }

    return { status: "success", organizations };
  }

  if (res.status === 401) {
    return { status: "unauthorized" };
  }

  return { status: "error", message: res.message };
}

/**
 * Maps the create response to an outcome.
 *
 * `submittedSlug` tells the mapper whether the user asked for a specific
 * slug. A conflict on a requested slug belongs on the slug field; a conflict
 * on a derived slug is a form-level problem, because there is no slug field
 * for the user to correct.
 */
export function mapCreateOutcome(
  res: ApiResult<CreateResponse>,
  submittedSlug?: string,
): CreateOrganizationOutcome {
  if (res.ok) {
    const organization = res.data?.organization;

    if (organization) {
      return { status: "success", organization };
    }

    return {
      status: "unavailable",
      message: "The workspace was created, but the response could not be read. Please refresh and try again.",
    };
  }

  if (res.status === 401) {
    return { status: "unauthorized" };
  }

  if (res.code === "VALIDATION_ERROR" && Array.isArray(res.details)) {
    const details = res.details as Array<{ path: string; message: string }>;
    const fields: Partial<Record<OrganizationField, string>> = {};

    for (const detail of details) {
      if (detail.path !== "name" && detail.path !== "slug") continue;
      fields[detail.path] ??= detail.message;
    }

    if (Object.keys(fields).length > 0) {
      return { status: "rejected", message: res.message, fields };
    }
  }

  if (res.code === "BAD_REQUEST" && isFieldDetails(res.details)) {
    const field = res.details.field;

    if (field === "name" || field === "slug") {
      return { status: "rejected", message: res.message, fields: { [field]: res.message } };
    }
  }

  if (res.status === 409) {
    return submittedSlug
      ? { status: "rejected", message: res.message, fields: { slug: res.message } }
      : { status: "rejected", message: res.message };
  }

  if (res.code === "NETWORK_ERROR" || res.status === 0) {
    return { status: "unavailable", message: res.message };
  }

  return { status: "rejected", message: res.message };
}

export async function listOrganizations(): Promise<OrganizationsOutcome> {
  const res = await apiFetch<ListResponse>("/api/v1/organizations", {
    method: "GET",
  });

  return mapListOutcome(res);
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationOutcome> {
  // An empty slug means "derive one from the name". Sending it as-is would
  // fail the backend's slug validation.
  const body: CreateOrganizationInput = input.slug
    ? input
    : { name: input.name };

  const res = await apiFetch<CreateResponse>("/api/v1/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return mapCreateOutcome(res, body.slug);
}
