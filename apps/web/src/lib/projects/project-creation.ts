import type { ProjectApiOutcome, ProjectField } from "./api";

/**
 * Project-creation flow helpers.
 *
 * The small pieces of the create flow that are worth testing without a
 * browser: where a created project lives, and what a failed creation can
 * tell the page.
 */

/**
 * Where a freshly created project lives.
 *
 * Built from the organization's canonical slug and the slug the backend
 * returned — the frontend never derives or guesses a project slug itself.
 */
export function projectDestination(
  orgSlug: string,
  projectSlug: string,
): string {
  return `/w/${orgSlug}/projects/${projectSlug}`;
}

const UNCONFIRMED_MESSAGE =
  "We couldn’t confirm that the project was created. Check your project " +
  "list before trying again — it may already be there.";

const UNAVAILABLE_WORKSPACE_MESSAGE =
  "This workspace is not available. The link may be out of date, or you " +
  "may not have access to it.";

/** What a failed creation tells the page. */
export type CreateProjectFailure =
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" }
  | { kind: "message"; message: string; fields?: Partial<Record<ProjectField, string>> };

/**
 * Maps a failed `createProject` outcome to what the page should show.
 *
 * `unavailable` is deliberately the "creation could not be confirmed"
 * copy: a POST that failed on a network problem may still have created the
 * project, so the person must check their project list instead of blindly
 * resubmitting. Nothing here ever produces a success destination — only a
 * confirmed `success` outcome carries the backend slug the page navigates
 * to.
 */
export function describeCreateProjectFailure(
  outcome: Exclude<
    ProjectApiOutcome<ProjectField, unknown>,
    { status: "success" }
  >,
): CreateProjectFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "rejected":
      return { kind: "message", message: outcome.message, fields: outcome.fields };
    case "forbidden":
    case "conflict":
      return { kind: "message", message: outcome.message };
    case "not-found":
      return { kind: "message", message: UNAVAILABLE_WORKSPACE_MESSAGE };
    case "unavailable":
      return { kind: "message", message: UNCONFIRMED_MESSAGE };
  }
}
