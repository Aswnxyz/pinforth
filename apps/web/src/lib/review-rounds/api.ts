import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * The review round and guest link client.
 *
 * Mirrors `packages/shared/src/review-rounds.ts` and
 * `apps/api/src/modules/review-rounds`. A guest link's secret is returned
 * once, by the create call, and can never be read again.
 */

export const REVIEW_ROUND_STATUSES = ["ACTIVE", "CLOSED", "ARCHIVED"] as const;
export type ReviewRoundStatus = (typeof REVIEW_ROUND_STATUSES)[number];

export interface ReviewRound {
  id: string;
  name: string;
  description: string | null;
  status: ReviewRoundStatus;
  environment: { id: string; name: string; url: string };
  activeLinksCount: number;
  issuesCount: number;
  createdAt: string;
}

export interface GuestLink {
  id: string;
  reviewRoundId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

/** What creating a link returns: the only time the invitation URL exists. */
export interface CreatedGuestLink {
  guestLink: GuestLink;
  invitationUrl: string;
}

export type ReviewRoundField = "name" | "environmentId" | "description";
export type GuestLinkField = "reviewerName" | "reviewerEmail" | "expiresInDays";

export interface CreateReviewRoundInput {
  name: string;
  environmentId: string;
  description?: string;
}

export interface CreateGuestLinkInput {
  reviewerName?: string;
  reviewerEmail?: string;
  expiresInDays: number;
}

export type ReviewApiOutcome<Field extends string, Data> =
  | { status: "success"; data: Data }
  | { status: "rejected"; message: string; fields?: Partial<Record<Field, string>> }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "not-found" }
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string };

const MALFORMED_MESSAGE =
  "Pinforth received an unexpected response. Please refresh and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown) => value === null || isString(value);
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

export function isReviewRound(value: unknown): value is ReviewRound {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.description) &&
    (REVIEW_ROUND_STATUSES as readonly unknown[]).includes(value.status) &&
    isRecord(value.environment) &&
    isString(value.environment.id) &&
    isString(value.environment.name) &&
    isString(value.environment.url) &&
    isCount(value.activeLinksCount) &&
    isCount(value.issuesCount) &&
    isString(value.createdAt)
  );
}

function isGuestLink(value: unknown): value is GuestLink {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.reviewRoundId) &&
    isNullableString(value.reviewerName) &&
    isNullableString(value.reviewerEmail) &&
    isString(value.expiresAt) &&
    isNullableString(value.revokedAt)
  );
}

function isCreatedGuestLink(value: unknown): value is CreatedGuestLink {
  return isRecord(value) && isGuestLink(value.guestLink) && isString(value.invitationUrl);
}

const isRoundList = (value: unknown): value is ReviewRound[] =>
  Array.isArray(value) && value.every(isReviewRound);

const isRevocation = (value: unknown): value is { revoked: true; id: string } =>
  isRecord(value) && value.revoked === true && isString(value.id);

function fieldErrorsFrom<Field extends string>(
  details: unknown,
  fields: readonly Field[],
): Partial<Record<Field, string>> | undefined {
  if (!Array.isArray(details)) return undefined;

  const errors: Partial<Record<Field, string>> = {};
  for (const detail of details) {
    if (!isRecord(detail) || !isString(detail.path) || !isString(detail.message)) continue;
    if ((fields as readonly string[]).includes(detail.path)) {
      errors[detail.path as Field] ??= detail.message;
    }
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

function mapOutcome<Field extends string, Data>(
  res: ApiResult<unknown>,
  pick: (data: unknown) => unknown,
  isData: (value: unknown) => value is Data,
  fields: readonly Field[] = [],
): ReviewApiOutcome<Field, Data> {
  if (res.ok) {
    const data = pick(res.data);
    return isData(data)
      ? { status: "success", data }
      : { status: "unavailable", message: MALFORMED_MESSAGE };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", message: res.message };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 409) return { status: "conflict", message: res.message };
  // A network failure or an outage: a mutation may or may not have landed.
  if (res.status === 0 || res.status >= 500) {
    return { status: "unavailable", message: res.message };
  }

  const fieldErrors = fieldErrorsFrom(res.details, fields);
  return { status: "rejected", message: res.message, ...(fieldErrors ? { fields: fieldErrors } : {}) };
}

const pickField = (key: string) => (data: unknown) => (isRecord(data) ? data[key] : undefined);

const roundsPath = (orgId: string, projectSlug: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectSlug)}/review-rounds`;

const linksPath = (orgId: string, projectSlug: string, roundId: string) =>
  `${roundsPath(orgId, projectSlug)}/${encodeURIComponent(roundId)}/guest-links`;

export async function listReviewRounds(
  orgId: string,
  projectSlug: string,
): Promise<ReviewApiOutcome<never, ReviewRound[]>> {
  const res = await apiFetch<unknown>(roundsPath(orgId, projectSlug), { method: "GET" });
  return mapOutcome(res, pickField("reviewRounds"), isRoundList);
}

export async function createReviewRound(
  orgId: string,
  projectSlug: string,
  input: CreateReviewRoundInput,
): Promise<ReviewApiOutcome<ReviewRoundField, ReviewRound>> {
  const res = await apiFetch<unknown>(roundsPath(orgId, projectSlug), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, pickField("reviewRound"), isReviewRound, [
    "name",
    "environmentId",
    "description",
  ]);
}

export async function createGuestLink(
  orgId: string,
  projectSlug: string,
  roundId: string,
  input: CreateGuestLinkInput,
): Promise<ReviewApiOutcome<GuestLinkField, CreatedGuestLink>> {
  const res = await apiFetch<unknown>(linksPath(orgId, projectSlug, roundId), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, (data) => data, isCreatedGuestLink, [
    "reviewerName",
    "reviewerEmail",
    "expiresInDays",
  ]);
}

/** Safe to repeat: revoking a revoked link answers the same way. */
export async function revokeGuestLink(
  orgId: string,
  projectSlug: string,
  roundId: string,
  linkId: string,
): Promise<ReviewApiOutcome<never, { revoked: true; id: string }>> {
  const res = await apiFetch<unknown>(
    `${linksPath(orgId, projectSlug, roundId)}/${encodeURIComponent(linkId)}`,
    { method: "DELETE" },
  );
  return mapOutcome(res, (data) => data, isRevocation);
}
