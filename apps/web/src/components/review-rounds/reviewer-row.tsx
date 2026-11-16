"use client";

import { FormAlert } from "@/components/ui/form-alert";
import type { EnvironmentGuestLink } from "@/lib/review-rounds/api";
import {
  reviewerAccessLine,
  reviewerActivityLine,
  reviewerName,
} from "@/lib/review-rounds/reviewers";

export interface RowRevoke {
  pending: boolean;
  message: string | null;
}

const smallButton =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** One reviewer's link. `revoke` is set while its confirm step is open. */
export function ReviewerRow({
  link,
  canRevoke,
  revoke,
  onRevokeStart,
  onRevokeConfirm,
  onRevokeCancel,
}: {
  link: EnvironmentGuestLink;
  canRevoke: boolean;
  revoke: RowRevoke | null;
  onRevokeStart: () => void;
  onRevokeConfirm: () => void;
  onRevokeCancel: () => void;
}) {
  const name = reviewerName(link);
  const showEmail = link.reviewerName && link.reviewerEmail;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium wrap-break-word text-foreground">{name}</span>
          {showEmail ? (
            <span className="block text-xs leading-5 break-all text-muted-foreground">
              {link.reviewerEmail}
            </span>
          ) : null}
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {reviewerAccessLine(link)} · {reviewerActivityLine(link)}
          </span>
        </div>

        {canRevoke && link.status === "ACTIVE" && !revoke ? (
          <button
            type="button"
            onClick={onRevokeStart}
            aria-label={`Revoke the review link for ${name}`}
            className={`${smallButton} border border-border-strong bg-surface-raised text-danger hover:bg-surface-muted focus-visible:outline-danger`}
          >
            Revoke
          </button>
        ) : null}
      </div>

      {revoke ? (
        <div
          role="alertdialog"
          aria-label={`Revoke the review link for ${name}?`}
          className="mt-3 space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-3"
        >
          <p className="text-sm leading-6 text-foreground">
            Revoke this link? {name} won’t be able to open the review or send more feedback.
            Issues they already sent stay.
          </p>
          {revoke.message ? <FormAlert>{revoke.message}</FormAlert> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRevokeConfirm}
              disabled={revoke.pending}
              aria-busy={revoke.pending}
              className={`${smallButton} bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:outline-danger`}
            >
              {revoke.pending ? "Revoking…" : "Revoke link"}
            </button>
            <button
              type="button"
              onClick={onRevokeCancel}
              disabled={revoke.pending}
              className={`${smallButton} border border-border-strong bg-surface-raised text-foreground hover:bg-surface-muted focus-visible:outline-accent`}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
