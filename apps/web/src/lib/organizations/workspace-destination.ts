/**
 * Works out where an authenticated user should land.
 *
 * This is deliberately a pure function: it takes the organization list and
 * returns a decision. It performs no navigation, reads no storage, and makes
 * no requests, so the rule can be tested on its own and reused by the
 * workspace chooser, the workspace guard, and the post-authentication
 * redirect without any of them drifting apart.
 */

export type WorkspaceDestination =
  /** The user belongs to no organization yet and needs to create one. */
  | { kind: "onboarding" }
  /** The user belongs to exactly one organization, so there is nothing to choose. */
  | { kind: "workspace"; slug: string }
  /** The user belongs to more than one organization and has to pick. */
  | { kind: "chooser" };

/**
 * Resolves the destination from the user's organizations.
 *
 * `slug` comes from the API, which guarantees a non-empty, URL-safe slug.
 */
export function resolveWorkspaceDestination(
  organizations: ReadonlyArray<{ slug: string }>,
): WorkspaceDestination {
  if (organizations.length === 0) {
    return { kind: "onboarding" };
  }

  if (organizations.length === 1) {
    return { kind: "workspace", slug: organizations[0].slug };
  }

  return { kind: "chooser" };
}

/**
 * The state of the workspace list.
 *
 * `error` and `unauthorized` are kept apart from `ready` with an empty list
 * on purpose: "this user has no workspaces" and "the list could not be
 * loaded" lead to completely different screens.
 */
export type WorkspaceStatus = "loading" | "ready" | "error" | "unauthorized";

/**
 * Whether a workspace route may show its content.
 *
 * `unauthorized` is not a content state on purpose. A refused session is not
 * an empty workspace list, so the route must not fall back to the chooser or
 * to onboarding.
 */
export type WorkspaceRouteState = "loading" | "error" | "ready";

export function resolveWorkspaceRouteState(
  status: WorkspaceStatus,
): WorkspaceRouteState {
  if (status === "error") return "error";
  if (status === "ready") return "ready";

  return "loading";
}
