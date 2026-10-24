import {
  listProjects,
  type ProjectApiOutcome,
  type ProjectField,
  type ProjectSummary,
} from "./api";

/**
 * Project-list loading logic.
 *
 * The pure pieces of the list route: how a `listProjects` outcome maps to a
 * renderable state. The guard that keeps an outdated response from
 * overwriting a newer one lives in `project-detail.ts` and is shared.
 */

export type ProjectListState =
  | { kind: "loading" }
  /** A confirmed list, possibly empty — only this state may show "No projects yet." */
  | { kind: "ready"; projects: ProjectSummary[] }
  /** Missing and inaccessible are the same state on purpose. */
  | { kind: "not-found" }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string }
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" };

/**
 * Maps a `listProjects` outcome to what the page should show.
 *
 * A failed request can never look like an empty list: the client's shape
 * guards already turned an unreadable 200 into `unavailable`, so `ready`
 * always carries a real (possibly empty) array from the backend. A 404 is
 * `not-found`, not empty — the workspace itself did not resolve.
 */
export function resolveProjectListState(
  outcome: ProjectApiOutcome<ProjectField, ProjectSummary[]>,
): ProjectListState {
  switch (outcome.status) {
    case "success":
      return { kind: "ready", projects: outcome.data };
    case "not-found":
      return { kind: "not-found" };
    case "forbidden":
      return { kind: "forbidden", message: outcome.message };
    // A rejected or conflicting GET is still a temporary API answer rather
    // than a statement about the workspace's projects.
    case "rejected":
    case "conflict":
    case "unavailable":
      return { kind: "unavailable", message: outcome.message };
    case "unauthorized":
      return { kind: "login" };
  }
}

/** Loads an organization's projects and resolves them to a renderable state. */
export async function loadProjectList(
  orgId: string,
): Promise<ProjectListState> {
  return resolveProjectListState(await listProjects(orgId));
}
