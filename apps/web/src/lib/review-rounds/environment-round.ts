import { createReviewRound, listReviewRounds, type ReviewRound } from "./api";

/**
 * Review rounds stay behind the scenes: inviting a reviewer to an environment
 * uses that environment's active round, creating one the first time. The API
 * requires a round for every guest link.
 */

export const ROUND_NAME_MAX = 180;

export const roundNameFor = (environmentName: string) =>
  `${environmentName} review`.slice(0, ROUND_NAME_MAX);

/** The newest active round for the environment, if any. */
export function activeRoundFor(rounds: readonly ReviewRound[], environmentId: string): ReviewRound | null {
  return (
    rounds
      .filter((round) => round.status === "ACTIVE" && round.environment.id === environmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export type EnvironmentRoundOutcome =
  | { status: "ready"; round: { id: string; name: string } }
  | { status: "login" }
  /** The project is gone or no longer accessible. */
  | { status: "gone" }
  | { status: "failed"; message: string };

const NOT_READY_MESSAGE = "We couldn’t get the invite ready. Please try again.";

/**
 * Always reads before it creates, so retrying after an unconfirmed create
 * finds the round that landed instead of making a second one.
 */
export async function findOrCreateEnvironmentRound(
  orgId: string,
  projectSlug: string,
  environment: { id: string; name: string },
): Promise<EnvironmentRoundOutcome> {
  const list = await listReviewRounds(orgId, projectSlug);
  if (list.status === "unauthorized") return { status: "login" };
  if (list.status === "not-found") return { status: "gone" };
  if (list.status !== "success") {
    return { status: "failed", message: list.status === "forbidden" ? list.message : NOT_READY_MESSAGE };
  }

  const existing = activeRoundFor(list.data, environment.id);
  if (existing) return { status: "ready", round: { id: existing.id, name: existing.name } };

  const created = await createReviewRound(orgId, projectSlug, {
    name: roundNameFor(environment.name),
    environmentId: environment.id,
  });
  if (created.status === "success") {
    return { status: "ready", round: { id: created.data.id, name: created.data.name } };
  }
  if (created.status === "unauthorized") return { status: "login" };
  if (created.status === "not-found") return { status: "gone" };
  return {
    status: "failed",
    message: created.status === "unavailable" ? NOT_READY_MESSAGE : created.message,
  };
}
