"use client";

import { useRef, useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import type { CreatedGuestLink } from "@/lib/review-rounds/api";
import { formatIssueDate } from "@/lib/issues/labels";

export interface RevokeState {
  confirming: boolean;
  pending: boolean;
  message: string | null;
  revoked: boolean;
}

const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The one moment a review link exists in readable form: the API keeps only
 * its hash. Revoking is offered here because there is no list of links yet.
 */
export function GuestLinkCreated({
  created,
  revoke,
  onRevokeStart,
  onRevokeConfirm,
  onRevokeCancel,
  onDone,
}: {
  created: CreatedGuestLink;
  revoke: RevokeState;
  onRevokeStart: () => void;
  onRevokeConfirm: () => void;
  onRevokeCancel: () => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
  const { guestLink, invitationUrl } = created;
  const who = guestLink.reviewerName ?? guestLink.reviewerEmail ?? "This reviewer";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopy("copied");
    } catch {
      // Clipboard access can be refused; leave the link selected instead.
      inputRef.current?.select();
      setCopy("manual");
    }
  }

  if (revoke.revoked) {
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm leading-6 text-foreground">
          The link was revoked. {who} can no longer open the review or send feedback.
        </p>
        <button type="button" onClick={onDone} className={secondaryButton}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review link ready</h3>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
          Copy it now and send it to {guestLink.reviewerName ?? "the reviewer"}.{" "}
          <strong className="font-semibold text-foreground">
            It won’t be shown again.
          </strong>{" "}
          Anyone with it can send feedback until {formatIssueDate(guestLink.expiresAt)}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`guest-link-${guestLink.id}`}>
          Review link
        </label>
        <input
          ref={inputRef}
          id={`guest-link-${guestLink.id}`}
          readOnly
          value={invitationUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy === "copied" ? "Copied" : "Copy link"}
        </button>
      </div>
      <p role="status" className="min-h-5 text-xs leading-5 text-muted-foreground">
        {copy === "copied" ? "Link copied to the clipboard." : null}
        {copy === "manual" ? "Copying was blocked. The link is selected — press Ctrl+C or ⌘C." : null}
      </p>

      {revoke.message ? <FormAlert>{revoke.message}</FormAlert> : null}

      {revoke.confirming ? (
        <div
          role="alertdialog"
          aria-label="Revoke this review link?"
          className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-4"
        >
          <p className="text-sm leading-6 text-foreground">
            Revoke this link? {who} won’t be able to open the review or send more feedback.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRevokeConfirm}
              disabled={revoke.pending}
              aria-busy={revoke.pending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-xs transition-colors hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              {revoke.pending ? "Revoking…" : "Revoke link"}
            </button>
            <button type="button" onClick={onRevokeCancel} disabled={revoke.pending} className={secondaryButton}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onDone} className={secondaryButton}>
            Done
          </button>
          <button
            type="button"
            onClick={onRevokeStart}
            className="text-sm font-medium text-danger underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger sm:ml-2"
          >
            Revoke this link
          </button>
        </div>
      )}
    </div>
  );
}
