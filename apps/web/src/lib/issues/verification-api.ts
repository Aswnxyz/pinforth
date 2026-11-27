import type {
  Attempt,
  CreateFixSubmissionInput,
  CreateVerificationInput,
  FixSubmission,
  Verification,
} from "@pinforth/shared";
import { apiFetch, type ApiResult } from "@/lib/auth/api";
import { isActor, isFixDeployment, isIssue, type Issue } from "./api";

/**
 * Fix submissions, tests and attempt history: docs/contracts/verification-v1.md.
 *
 * Both writes carry a `clientMutationId`, so a request whose outcome is
 * unknown is resent with the same id and the API answers with the original
 * record instead of making a second one (§6).
 */
export type { Attempt, CreateFixSubmissionInput, CreateVerificationInput, FixSubmission, Verification };

export const VERIFICATION_FIELDS = ["deploymentId", "note", "result", "fixSubmissionId"] as const;
export type VerificationField = (typeof VERIFICATION_FIELDS)[number];
export type VerificationFieldErrors = Partial<Record<VerificationField, string>>;

export type VerificationApiOutcome<Data> =
  | { status: "success"; data: Data }
  | { status: "rejected"; message: string; fields?: VerificationFieldErrors }
  | { status: "unauthorized" }
  /** `code` tells SELF_VERIFICATION_NOT_ALLOWED and EMAIL_NOT_VERIFIED apart. */
  | { status: "forbidden"; message: string; code: string | null }
  | { status: "not-found" }
  /** FIX_ALREADY_PENDING, FIX_NOT_CURRENT, DEPLOYMENT_NOT_NEWER, IDEMPOTENCY_KEY_REUSED, … */
  | { status: "conflict"; message: string; code: string | null }
  /** The request may or may not have landed. */
  | { status: "unavailable"; message: string };

/** The 409s that mean our copy of the issue is out of date. */
export const STALE_ISSUE_CODES = ["FIX_ALREADY_PENDING", "FIX_NOT_CURRENT"] as const;

const MALFORMED_MESSAGE = "Pinforth received an unexpected response. Please refresh and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

export function isFixSubmission(value: unknown): value is FixSubmission {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.issueId) &&
    Number.isInteger(value.attemptNumber) &&
    isFixDeployment(value.deployment) &&
    (value.submittedBy === null || isActor(value.submittedBy)) &&
    isNullableString(value.note) &&
    isString(value.createdAt) &&
    isNullableString(value.withdrawnAt) &&
    (value.withdrawnBy === null || isActor(value.withdrawnBy))
  );
}

export function isVerification(value: unknown): value is Verification {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.fixSubmissionId) &&
    isFixDeployment(value.deployment) &&
    (value.verifiedBy === null || isActor(value.verifiedBy)) &&
    (value.result === "PASS" || value.result === "FAIL") &&
    isNullableString(value.note) &&
    typeof value.selfVerified === "boolean" &&
    isString(value.createdAt)
  );
}

function isAttempt(value: unknown): value is Attempt {
  return (
    isRecord(value) &&
    Number.isInteger(value.attempt) &&
    isFixSubmission(value.fix) &&
    (value.verification === null || isVerification(value.verification))
  );
}

const isAttemptList = (value: unknown): value is Attempt[] => Array.isArray(value) && value.every(isAttempt);

function fieldErrorsFrom(details: unknown): VerificationFieldErrors | undefined {
  if (!Array.isArray(details)) return undefined;
  const fields: VerificationFieldErrors = {};

  for (const detail of details) {
    if (!isRecord(detail) || !isString(detail.path) || !isString(detail.message)) continue;
    if ((VERIFICATION_FIELDS as readonly string[]).includes(detail.path)) {
      fields[detail.path as VerificationField] ??= detail.message;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function mapOutcome<Data>(
  res: ApiResult<unknown>,
  pick: (data: unknown) => unknown,
  isData: (value: unknown) => value is Data,
): VerificationApiOutcome<Data> {
  if (res.ok) {
    const data = pick(res.data);
    return isData(data) ? { status: "success", data } : { status: "unavailable", message: MALFORMED_MESSAGE };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", message: res.message, code: res.code ?? null };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 409) return { status: "conflict", message: res.message, code: res.code ?? null };
  if (res.status === 0 || res.status >= 500) return { status: "unavailable", message: res.message };

  const fields = fieldErrorsFrom(res.details);
  return { status: "rejected", message: res.message, ...(fields ? { fields } : {}) };
}

const issuePath = (orgId: string, projectSlug: string, number: number) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectSlug)}` +
  `/issues/${encodeURIComponent(String(number))}`;

export interface FixWrite {
  fix: FixSubmission;
  issue: Issue;
}

export interface VerificationWrite {
  verification: Verification;
  issue: Issue;
}

const isFixWrite = (value: unknown): value is FixWrite =>
  isRecord(value) && isFixSubmission(value.fix) && isIssue(value.issue);

const isVerificationWrite = (value: unknown): value is VerificationWrite =>
  isRecord(value) && isVerification(value.verification) && isIssue(value.issue);

/** 201 for a new fix; 200 when the same `clientMutationId` already landed. */
export async function submitFix(
  orgId: string,
  projectSlug: string,
  number: number,
  input: CreateFixSubmissionInput,
): Promise<VerificationApiOutcome<FixWrite>> {
  const res = await apiFetch(`${issuePath(orgId, projectSlug, number)}/fixes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, (data) => data, isFixWrite);
}

export async function recordVerification(
  orgId: string,
  projectSlug: string,
  number: number,
  input: CreateVerificationInput,
): Promise<VerificationApiOutcome<VerificationWrite>> {
  const res = await apiFetch(`${issuePath(orgId, projectSlug, number)}/verifications`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, (data) => data, isVerificationWrite);
}

/** Newest first, by the stable attempt number. */
export async function listAttempts(
  orgId: string,
  projectSlug: string,
  number: number,
): Promise<VerificationApiOutcome<Attempt[]>> {
  const res = await apiFetch(`${issuePath(orgId, projectSlug, number)}/attempts`, { method: "GET" });
  return mapOutcome(res, (data) => (isRecord(data) ? data.attempts : undefined), isAttemptList);
}
