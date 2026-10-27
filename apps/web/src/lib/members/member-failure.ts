import type { MemberApiOutcome } from "@/lib/organizations/members-api";

/**
 * How a failed member mutation is explained.
 *
 * Shared by role changes, removals and leaving, because the backend answers
 * them the same way. The two message-bearing outcomes are supplied by the
 * caller: the wording depends on the action, not on the HTTP status.
 */

export type MemberFailure =
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" }
  /** The member is gone; reload the list and drop the stale row. */
  | { kind: "gone" }
  /** The caller's permission changed; offer to refresh workspace access. */
  | { kind: "access"; message: string }
  /**
   * The request failed without an answer, so the mutation may still have been
   * applied server-side. It must never be retried automatically — the result
   * has to be read back first.
   */
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string };

export interface MemberFailureMessages {
  /** Shown for a 409 `LAST_OWNER`, in the caller's action wording. */
  lastOwnerMessage: string;
  /** Shown when the answer was lost; the action may or may not have run. */
  unconfirmedMessage: string;
}

/** Maps a failed member mutation to what the page should do. */
export function describeMemberFailure(
  outcome: Exclude<MemberApiOutcome<unknown>, { status: "success" }>,
  { lastOwnerMessage, unconfirmedMessage }: MemberFailureMessages,
): MemberFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "not-found":
      return { kind: "gone" };
    case "forbidden":
      return { kind: "access", message: outcome.message };
    case "last-owner":
      return { kind: "message", message: lastOwnerMessage };
    case "rejected":
    case "conflict":
      return { kind: "message", message: outcome.message };
    case "unavailable":
      return { kind: "refresh", message: unconfirmedMessage };
  }
}
