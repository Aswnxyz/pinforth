"use client";

import { useEffect, useEffectEvent, useId, useState } from "react";
import { resolveLoadState } from "@/lib/issues/issue-loading";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";
import {
  listEnvironmentGuestLinks,
  revokeGuestLink,
  type EnvironmentGuestLink,
} from "@/lib/review-rounds/api";
import {
  markRevoked,
  reviewerName,
  reviewersSummary,
  splitReviewers,
} from "@/lib/review-rounds/reviewers";
import { describeReviewFailure, UNCONFIRMED_REVOKE_MESSAGE } from "@/lib/review-rounds/review-values";
import { ReviewerRow, type RowRevoke } from "./reviewer-row";

const linkButton =
  "inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Who can review one environment, with revoke at any time. Collapsed to a
 * count by default; past (expired or revoked) links are a second toggle.
 */
export function EnvironmentReviewers({
  orgId,
  projectSlug,
  environment,
  reloadToken,
  canRevoke,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  environment: { id: string; name: string };
  /** Bumped by the page after an invite closes, to show the new link. */
  reloadToken: number;
  canRevoke: boolean;
  onGone: () => void;
  onLogin: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [revoking, setRevoking] = useState<({ key: string; linkId: string } & RowRevoke) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { key, state, guard, retry, update } = useGuardedLoad<EnvironmentGuestLink[]>(
    `${orgId}|${projectSlug}|${environment.id}|${reloadToken}`,
    async () => resolveLoadState(await listEnvironmentGuestLinks(orgId, projectSlug, environment.id)),
  );
  const activeRevoke = revoking && revoking.key === key ? revoking : null;

  const leave = useEffectEvent((kind: string) => (kind === "login" ? onLogin() : onGone()));
  useEffect(() => {
    if (state.kind === "login" || state.kind === "not-found") leave(state.kind);
  }, [state.kind]);

  async function handleRevoke(link: EnvironmentGuestLink) {
    const forKey = key;
    const token = guard.start();
    setNotice(null);
    setRevoking({ key: forKey, linkId: link.id, pending: true, message: null });

    const outcome = await revokeGuestLink(orgId, projectSlug, link.reviewRoundId, link.id);
    if (!guard.accept(token)) return;

    if (outcome.status === "success") {
      update(forKey, (links) => markRevoked(links, link.id, new Date().toISOString()));
      setRevoking(null);
      setNotice(`${reviewerName(link)}’s link was revoked.`);
      return;
    }

    const failure = describeReviewFailure(outcome, UNCONFIRMED_REVOKE_MESSAGE);
    if (failure.kind === "login") return onLogin();
    if (failure.kind === "gone") {
      // The link or its round is gone; the reloaded list shows what's left.
      setRevoking(null);
      return retry();
    }
    // Revoking is safe to repeat, so the confirm step stays open.
    setRevoking({ key: forKey, linkId: link.id, pending: false, message: failure.message });
  }

  if (state.kind === "loading" || state.kind === "login" || state.kind === "not-found") {
    return <p className="text-xs leading-5 text-muted-foreground">Loading reviewers…</p>;
  }

  if (state.kind !== "ready") {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        Couldn’t load the reviewers.{" "}
        <button type="button" onClick={retry} className={linkButton}>
          Try again
        </button>
      </p>
    );
  }

  if (state.data.length === 0) {
    return <p className="text-xs leading-5 text-muted-foreground">No reviewers invited yet.</p>;
  }

  const { active, past } = splitReviewers(state.data);
  const rows = (links: EnvironmentGuestLink[]) =>
    links.map((link) => (
      <ReviewerRow
        key={link.id}
        link={link}
        canRevoke={canRevoke}
        revoke={activeRevoke?.linkId === link.id ? activeRevoke : null}
        onRevokeStart={() => {
          setNotice(null);
          setRevoking({ key, linkId: link.id, pending: false, message: null });
        }}
        onRevokeConfirm={() => void handleRevoke(link)}
        onRevokeCancel={() => setRevoking(null)}
      />
    ));

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-reviewers`}
        onClick={() => setOpen((value) => !value)}
        className={linkButton}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3.5 fill-current transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        Reviewers · {reviewersSummary(active.length)}
        <span className="sr-only"> on {environment.name}</span>
      </button>

      <p role="status" className="text-xs leading-5 text-muted-foreground">
        {notice}
      </p>

      {open ? (
        <div id={`${id}-reviewers`} className="mt-1 pl-5">
          {active.length > 0 ? (
            <ul className="divide-y divide-border">{rows(active)}</ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">No one has a working link right now.</p>
          )}

          {past.length > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                aria-expanded={showPast}
                onClick={() => setShowPast((value) => !value)}
                className={`${linkButton} text-muted-foreground`}
              >
                {showPast ? "Hide past reviewers" : `Show past reviewers (${past.length})`}
              </button>
              {showPast ? <ul className="divide-y divide-border">{rows(past)}</ul> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
