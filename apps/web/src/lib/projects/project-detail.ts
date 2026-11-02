import { getProject, type ProjectApiOutcome, type ProjectDetail, type ProjectField } from "./api";

/**
 * Project-detail loading logic.
 *
 * The pure pieces of the detail route: how a `getProject` outcome maps to a
 * renderable state, and the guard that keeps an outdated response from
 * overwriting a newer one when the route parameters change.
 */

export type ProjectDetailState =
  | { kind: "loading" }
  | { kind: "ready"; project: ProjectDetail }
  /** Missing and inaccessible are the same state on purpose. */
  | { kind: "not-found" }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string }
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" };

/**
 * Maps a `getProject` outcome to what the page should show.
 *
 * A malformed or missing payload has already been mapped to `unavailable`
 * by the client's shape guards, so `ready` always carries a real project —
 * a failed request can never look like an empty one.
 */
export function resolveProjectDetailState(
  outcome: ProjectApiOutcome<ProjectField, ProjectDetail>,
): ProjectDetailState {
  switch (outcome.status) {
    case "success":
      return { kind: "ready", project: outcome.data };
    case "not-found":
      return { kind: "not-found" };
    case "forbidden":
      return { kind: "forbidden", message: outcome.message };
    // A rejected or conflicting GET is not retryable in a useful way, but
    // it is still a temporary API answer rather than a statement about the
    // project.
    case "rejected":
    case "conflict":
    case "unavailable":
      return { kind: "unavailable", message: outcome.message };
    case "unauthorized":
      return { kind: "login" };
  }
}

/** Loads one project and resolves it to a renderable state. */
export async function loadProjectDetail(
  orgId: string,
  projectSlug: string,
): Promise<ProjectDetailState> {
  return resolveProjectDetailState(await getProject(orgId, projectSlug));
}

/**
 * Only the newest request may write state.
 *
 * When the route parameters change (another project, another organization)
 * a response from the superseded request can still arrive; the page must
 * ignore it so data from one workspace is never shown under another. This
 * mirrors the request guard the workspace provider already uses.
 */
export function createRequestGuard(): {
  start: () => number;
  accept: (token: number) => boolean;
} {
  let latest = 0;

  return {
    start: () => ++latest,
    accept: (token) => token === latest,
  };
}
