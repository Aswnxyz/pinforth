import { resolveLoadState, type LoadState } from "@/lib/issues/issue-loading";
import { getProject, type ProjectDetail } from "@/lib/projects/api";
import { listReviewRounds, type ReviewRound } from "./api";

export interface ReviewWorkspace {
  project: ProjectDetail;
  rounds: ReviewRound[];
}

/** The project and its review rounds; either failing decides the screen. */
export async function loadReviewWorkspace(
  orgId: string,
  projectSlug: string,
): Promise<LoadState<ReviewWorkspace>> {
  const [project, rounds] = await Promise.all([
    getProject(orgId, projectSlug),
    listReviewRounds(orgId, projectSlug),
  ]);

  const projectState = resolveLoadState(project);
  if (projectState.kind !== "ready") return projectState;

  const roundsState = resolveLoadState(rounds);
  if (roundsState.kind !== "ready") return roundsState;

  return { kind: "ready", data: { project: projectState.data, rounds: roundsState.data } };
}

/** Adjusts one round's active-link count after a create or revoke. */
export function adjustActiveLinks(
  rounds: readonly ReviewRound[],
  roundId: string,
  delta: number,
): ReviewRound[] {
  return rounds.map((round) =>
    round.id === roundId
      ? { ...round, activeLinksCount: Math.max(0, round.activeLinksCount + delta) }
      : round,
  );
}
