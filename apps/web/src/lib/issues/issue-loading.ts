import { listMembers, type OrganizationMember } from "@/lib/organizations/members-api";
import { getProject, type ProjectDetail } from "@/lib/projects/api";
import type { IssuePage } from "./api";
import { personName } from "./labels";

/**
 * The pure loading pieces of the issue routes: how an API outcome maps to a
 * renderable state, how pages are merged, and the project context every
 * issue screen needs (the project itself and who can be assigned).
 */

export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  /** Missing and inaccessible are the same state on purpose. */
  | { kind: "not-found" }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string }
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" };

/** Structurally matches both the project and the issue client outcomes. */
type ReadOutcome<T> =
  | { status: "success"; data: T }
  | { status: "unauthorized" }
  | { status: "not-found" }
  | {
      status: "forbidden" | "rejected" | "conflict" | "unavailable";
      message: string;
    };

/**
 * Maps a read to what the page should show. A failed read can never look like
 * an empty list: the clients already turned an unreadable 200 into
 * `unavailable`.
 */
export function resolveLoadState<T>(outcome: ReadOutcome<T>): LoadState<T> {
  switch (outcome.status) {
    case "success":
      return { kind: "ready", data: outcome.data };
    case "not-found":
      return { kind: "not-found" };
    case "unauthorized":
      return { kind: "login" };
    case "forbidden":
      return { kind: "forbidden", message: outcome.message };
    // A rejected or conflicting GET is still a temporary answer rather than
    // a statement about the data.
    case "rejected":
    case "conflict":
    case "unavailable":
      return { kind: "unavailable", message: outcome.message };
  }
}

export interface IssueWorkspace {
  project: ProjectDetail;
  /** Null when the member list could not be read; assignment is then hidden. */
  members: OrganizationMember[] | null;
}

/**
 * Loads the project and its organization's members together.
 *
 * The project decides the state. The members only feed the assignee choices,
 * so failing to read them degrades the screen instead of blocking it — except
 * an expired session, which is never ignored.
 */
export async function loadIssueWorkspace(
  orgId: string,
  projectSlug: string,
): Promise<LoadState<IssueWorkspace>> {
  const [project, members] = await Promise.all([
    getProject(orgId, projectSlug),
    listMembers(orgId),
  ]);

  if (members.status === "unauthorized") return { kind: "login" };

  const state = resolveLoadState(project);
  if (state.kind !== "ready") return state;

  return {
    kind: "ready",
    data: {
      project: state.data,
      members: members.status === "success" ? members.data : null,
    },
  };
}

export interface AssigneeOption {
  /** The membership id, which is what an issue is assigned to. */
  id: string;
  label: string;
}

export function assigneeOptions(
  members: readonly OrganizationMember[],
): AssigneeOption[] {
  return members.map((member) => {
    const name = personName(member.user);
    return { id: member.id, label: member.isYou ? `${name} (you)` : name };
  });
}

/**
 * Appends a "Load more" page. Paging is by offset, so an issue created in
 * between shifts the next page by a row: one already on screen is not
 * repeated. The newest page's counts and position win.
 */
export function mergeIssuePages(current: IssuePage, next: IssuePage): IssuePage {
  const seen = new Set(current.issues.map((issue) => issue.id));

  return {
    issues: [...current.issues, ...next.issues.filter((issue) => !seen.has(issue.id))],
    pagination: next.pagination,
    counts: next.counts,
  };
}

/** Parses the `[number]` route segment; anything but a positive integer is null. */
export function parseIssueNumber(segment: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(segment)) return null;

  const number = Number(segment);
  return Number.isSafeInteger(number) ? number : null;
}
