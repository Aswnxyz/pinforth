import {
  listMembers,
  type MemberApiOutcome,
  type OrganizationMember,
} from "@/lib/organizations/members-api";

/**
 * Member-list loading logic.
 *
 * The pure pieces of the members route: how a `listMembers` outcome maps to a
 * renderable state. The guard that keeps an outdated response from
 * overwriting a newer one lives in `project-detail.ts` and is shared.
 */

export type MemberListState =
  | { kind: "loading" }
  /** A confirmed list, possibly empty — only this state may show the empty state. */
  | { kind: "ready"; members: OrganizationMember[] }
  /** Missing and inaccessible are the same state on purpose. */
  | { kind: "not-found" }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string }
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" };

/**
 * Maps a `listMembers` outcome to what the page should show.
 *
 * A failed request can never look like an empty list: the client's shape
 * guards already turned an unreadable 200 into `unavailable`, so `ready`
 * always carries a real (possibly empty) array from the backend.
 */
export function resolveMemberListState(
  outcome: MemberApiOutcome<OrganizationMember[]>,
): MemberListState {
  switch (outcome.status) {
    case "success":
      return { kind: "ready", members: outcome.data };
    case "not-found":
      return { kind: "not-found" };
    case "forbidden":
      return { kind: "forbidden", message: outcome.message };
    // The mutating-request answers (rejected, conflict, last-owner) cannot
    // come from a GET, but they are still temporary API answers rather than
    // a statement about the workspace's members.
    case "rejected":
    case "conflict":
    case "last-owner":
    case "unavailable":
      return { kind: "unavailable", message: outcome.message };
    case "unauthorized":
      return { kind: "login" };
  }
}

/** Loads an organization's members and resolves them to a renderable state. */
export async function loadMemberList(
  orgId: string,
): Promise<MemberListState> {
  return resolveMemberListState(await listMembers(orgId));
}
