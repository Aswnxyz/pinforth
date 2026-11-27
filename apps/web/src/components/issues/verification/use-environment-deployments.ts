"use client";

import { DEPLOYMENT_PAGE_LIMIT, listDeployments, type Deployment } from "@/lib/deployments/api";
import { resolveLoadState } from "@/lib/issues/issue-loading";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";

/**
 * The newest deployments on one environment, for picking the one a fix is in
 * or was retested on. A fix almost always names a recent deployment, so one
 * page of the largest size is enough.
 */
export function useEnvironmentDeployments(orgId: string, projectSlug: string, environmentId: string | null) {
  const load = useGuardedLoad<Deployment[]>(`${orgId}|${projectSlug}|${environmentId}`, async () => {
    if (!environmentId) return { kind: "ready", data: [] };
    const state = resolveLoadState(
      await listDeployments(orgId, projectSlug, environmentId, null, DEPLOYMENT_PAGE_LIMIT),
    );
    return state.kind === "ready" ? { kind: "ready", data: state.data.deployments } : state;
  });

  return {
    state: load.state,
    retry: load.retry,
    /** Puts a deployment recorded just now at the top. */
    add: (deployment: Deployment) =>
      load.update(load.key, (current) => [deployment, ...current.filter((item) => item.id !== deployment.id)]),
  };
}
