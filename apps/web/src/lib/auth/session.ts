/**
 * The state of the signed-in session.
 *
 * The distinction that matters is between a session that is known to be
 * invalid and a session that could not be checked. Only the first one may
 * send the user to sign in.
 */
export type AuthStatus =
  /** The session is still being checked. */
  | "loading"
  /** A confirmed, valid session. */
  | "authenticated"
  /** A confirmed invalid session: the API refused it. */
  | "unauthenticated"
  /** The session could not be checked, usually because the API is unreachable. */
  | "unavailable";

/**
 * Where a page should send the user once the session is known.
 */
export type SessionContinuation =
  /** The session is not known yet, so no destination can be offered. */
  | "pending"
  /** The user is signed in. */
  | "workspace"
  /** The user is not signed in. */
  | "sign-in";

export function resolveSessionContinuation(
  status: AuthStatus,
): SessionContinuation {
  if (status === "loading" || status === "unavailable") {
    return "pending";
  }

  return status === "authenticated" ? "workspace" : "sign-in";
}
