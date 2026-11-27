import {
  createFixSubmissionSchema,
  createVerificationSchema,
  type CreateFixSubmissionInput,
  type CreateVerificationInput,
  type VerificationResult,
} from "@pinforth/shared";
import type { Issue, PendingFix } from "./api";
import type { Attempt, VerificationField, VerificationFieldErrors } from "./verification-api";

/**
 * The pure rules behind submitting and testing a fix: what is sent, who may
 * do what, which deployments a retest may use, and how attempts read.
 */

/** One id per user action, reused only to resend that action (contract §6). */
export function newMutationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; a LAN address over http isn't one.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Prepared<Input> = { input: Input } | { errors: VerificationFieldErrors };

function errorsFrom(issues: readonly { path: PropertyKey[]; message: string }[]): VerificationFieldErrors {
  const errors: VerificationFieldErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "") as VerificationField;
    if (field === "deploymentId" || field === "note" || field === "result") errors[field] ??= issue.message;
  }
  return errors;
}

export interface FixValues {
  deploymentId: string;
  note: string;
}

export function prepareFix(values: FixValues, clientMutationId: string): Prepared<CreateFixSubmissionInput> {
  if (!values.deploymentId) return { errors: { deploymentId: "Choose the deployment that has the fix." } };

  const parsed = createFixSubmissionSchema.safeParse({ ...values, clientMutationId });
  return parsed.success ? { input: parsed.data } : { errors: errorsFrom(parsed.error.issues) };
}

export interface TestValues {
  result: VerificationResult | "";
  note: string;
  deploymentId: string;
}

export function prepareTest(
  values: TestValues,
  fixSubmissionId: string,
  clientMutationId: string,
): Prepared<CreateVerificationInput> {
  if (!values.result) return { errors: { result: "Choose Passed or Failed." } };
  if (values.result === "FAIL" && !values.note.trim()) {
    return { errors: { note: "Say what still fails, so the next fix can address it." } };
  }

  const parsed = createVerificationSchema.safeParse({
    fixSubmissionId,
    result: values.result,
    note: values.note,
    deploymentId: values.deploymentId || null,
    clientMutationId,
  });
  return parsed.success ? { input: parsed.data } : { errors: errorsFrom(parsed.error.issues) };
}

const isMine = (fix: Pick<PendingFix, "submittedBy">, meId: string | null) =>
  meId !== null && fix.submittedBy?.id === meId;

/** Only the person who submitted the fix can withdraw it. */
export const canWithdraw = isMine;

/**
 * `own-fix`: someone else has to test it. `self`: the only member, so it is
 * recorded as self-verified. With the members unknown, the API decides.
 */
export function testAccess(
  fix: Pick<PendingFix, "submittedBy">,
  meId: string | null,
  memberCount: number | null,
): "allowed" | "self" | "own-fix" {
  if (!isMine(fix, meId) || memberCount === null) return "allowed";
  return memberCount === 1 ? "self" : "own-fix";
}

interface Ordered {
  id: string;
  createdAt: string;
}

/** Deployment order is `createdAt DESC, id DESC`; true when `a` is `b` or newer. */
export function isSameOrNewer(a: Ordered, b: Ordered): boolean {
  const at = Date.parse(a.createdAt);
  const bt = Date.parse(b.createdAt);
  return at !== bt ? at > bt : a.id >= b.id;
}

/**
 * Where a fix may be retested: its own deployment or a newer one on the same
 * environment, newest first. The fix's deployment is always offered.
 */
export function retestOptions<D extends Ordered & { environmentId: string }>(deployments: readonly D[], fixDeployment: D): D[] {
  const options = deployments.filter(
    (deployment) => deployment.environmentId === fixDeployment.environmentId && isSameOrNewer(deployment, fixDeployment),
  );
  return options.some((deployment) => deployment.id === fixDeployment.id) ? options : [...options, fixDeployment];
}

export type AttemptState = "waiting" | "passed" | "failed" | "withdrawn" | "untested";

/** `untested`: the issue was closed or reopened before anyone tested it. */
export function attemptState(attempt: Attempt, pendingFixId: string | null): AttemptState {
  if (attempt.verification) return attempt.verification.result === "PASS" ? "passed" : "failed";
  if (attempt.fix.withdrawnAt) return "withdrawn";
  return attempt.fix.id === pendingFixId ? "waiting" : "untested";
}

/**
 * The attempt an open issue was reopened after: its latest fix that wasn't
 * withdrawn. Null when it was never reopened.
 */
export function reopenedAfter(status: Issue["status"], attempts: readonly Attempt[]): number | null {
  if (status !== "NEW" && status !== "IN_PROGRESS") return null;
  return attempts.find((attempt) => !attempt.fix.withdrawnAt)?.attempt ?? null;
}

export const actorName = (actor: { name: string | null } | null) => actor?.name?.trim() || "A former member";

export const UNCONFIRMED_FIX_MESSAGE =
  "We couldn’t confirm the fix was submitted. Send it again: it won’t be recorded twice.";
export const UNCONFIRMED_TEST_MESSAGE =
  "We couldn’t confirm the result was recorded. Send it again: it won’t be recorded twice.";
