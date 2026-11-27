"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { listDeployments, type Deployment, type DeploymentPage } from "@/lib/deployments/api";
import { formatDeploymentTime, mergeDeploymentPages, shortSha } from "@/lib/deployments/deployment-values";
import { resolveLoadState } from "@/lib/issues/issue-loading";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";
import { safeWebsiteUrl } from "@/lib/projects/urls";

const linkButton =
  "text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

/** An environment's recorded deployments, newest first. */
export function DeploymentHistory({
  orgId,
  projectSlug,
  environmentId,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  environmentId: string;
  onGone: () => void;
  onLogin: () => void;
}) {
  const { key, state, guard, retry, update } = useGuardedLoad<DeploymentPage>(
    `${orgId}|${projectSlug}|${environmentId}`,
    async () => resolveLoadState(await listDeployments(orgId, projectSlug, environmentId, null)),
  );
  const [more, setMore] = useState<{ key: string; pending: boolean; message: string | null } | null>(null);
  const activeMore = more && more.key === key ? more : null;

  const leave = useEffectEvent((kind: string) => (kind === "login" ? onLogin() : onGone()));
  useEffect(() => {
    if (state.kind === "login" || state.kind === "not-found") leave(state.kind);
  }, [state.kind]);

  async function loadMore(cursor: string) {
    const forKey = key;
    const token = guard.start();
    setMore({ key: forKey, pending: true, message: null });

    const outcome = await listDeployments(orgId, projectSlug, environmentId, cursor);
    if (!guard.accept(token)) return;

    if (outcome.status === "success") {
      update(forKey, (page) => mergeDeploymentPages(page, outcome.data));
      return setMore(null);
    }
    if (outcome.status === "unauthorized") return onLogin();
    if (outcome.status === "not-found") return onGone();
    setMore({ key: forKey, pending: false, message: outcome.message });
  }

  if (state.kind === "loading" || state.kind === "login" || state.kind === "not-found") {
    return <p className="text-xs leading-5 text-muted-foreground">Loading deployments…</p>;
  }

  if (state.kind !== "ready") {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        Couldn’t load the deployments.{" "}
        <button type="button" onClick={retry} className={linkButton}>
          Try again
        </button>
      </p>
    );
  }

  const { deployments, nextCursor } = state.data;
  if (deployments.length === 0) {
    return <p className="text-xs leading-5 text-muted-foreground">No deployments recorded yet.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {deployments.map((deployment) => (
          <DeploymentRow key={deployment.id} deployment={deployment} />
        ))}
      </ul>

      {nextCursor ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => void loadMore(nextCursor)}
            disabled={activeMore?.pending}
            className={linkButton}
          >
            {activeMore?.pending ? "Loading…" : "Show older deployments"}
          </button>
          {activeMore?.message ? <p className="text-xs text-danger">{activeMore.message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const href = deployment.url ? safeWebsiteUrl(deployment.url) : null;
  const by = deployment.createdBy?.name?.trim();

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono font-semibold break-all text-foreground">{deployment.label}</span>
        {deployment.commitSha ? (
          <span title={deployment.commitSha} className="font-mono text-xs text-muted-foreground">
            {shortSha(deployment.commitSha)}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {formatDeploymentTime(deployment.createdAt)}
          {by ? ` · ${by}` : ""}
        </span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-xs text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {href}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : deployment.url ? (
        <span className="block font-mono text-xs break-all text-muted-foreground">{deployment.url}</span>
      ) : null}
      {deployment.notes ? (
        <p className="mt-1 wrap-break-word whitespace-pre-wrap text-muted-foreground">{deployment.notes}</p>
      ) : null}
    </li>
  );
}
