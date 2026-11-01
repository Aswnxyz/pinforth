"use client";

import { useEffect, useRef } from "react";
import { FormAlert } from "@/components/ui/form-alert";

export type LeavePhase = "idle" | "confirming" | "leaving" | "checking";

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

const dangerButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-xs transition-colors hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The Leave Organization section.
 *
 * Presentational: the parent owns the request and the membership id. It opens
 * a confirmation in place rather than a dialog, keeps the explanation and any
 * failure visible, and only ever confirms from an explicit second click.
 */
export function LeaveOrganization({
  organizationName,
  phase,
  soleOwner = false,
  message = null,
  offerRecheck = false,
  startDisabled = false,
  onStart,
  onCancel,
  onConfirm,
  onRecheck,
  onRefreshAccess,
}: {
  organizationName: string;
  phase: LeavePhase;
  /** Warns that the backend will refuse because this is the only OWNER. */
  soleOwner?: boolean;
  message?: string | null;
  /** Blocks another attempt until an unconfirmed leave has been checked. */
  offerRecheck?: boolean;
  /** Keeps the start action out of reach while another request is pending. */
  startDisabled?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Present after an unconfirmed DELETE; re-reads the caller's access. */
  onRecheck: () => void;
  /** Present when the backend refused the caller's permission. */
  onRefreshAccess?: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (phase === "confirming") cancelRef.current?.focus();
    if (phase === "idle" && hasOpened.current) startRef.current?.focus();
    if (phase !== "idle") hasOpened.current = true;
  }, [phase]);

  const pending = phase === "leaving" || phase === "checking";

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs">
      <h2 className="text-base font-semibold text-foreground">
        Leave organization
      </h2>

      {phase === "idle" ? (
        <>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Leaving {organizationName} immediately removes your access to its
            projects and member management. There is no invitation flow yet, so
            rejoining needs another member to add you.
          </p>

          <button
            ref={startRef}
            type="button"
            onClick={onStart}
            disabled={startDisabled}
            aria-label={`Leave ${organizationName}`}
            className={`${secondaryButtonClass} mt-4 w-full border-danger/50 text-danger hover:bg-danger/10 sm:w-auto`}
          >
            Leave organization
          </button>
        </>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5">
            <p className="text-sm leading-6 text-foreground">
              You are about to leave <strong>{organizationName}</strong>. This
              immediately removes your access to its projects and member
              management, and there is no invitation flow yet — rejoining needs
              another member to add you.
            </p>

            {soleOwner ? (
              <p className="mt-2 text-sm leading-6 font-medium text-danger">
                You’re the only Owner. Promote another Owner before you leave —
                an organization must keep at least one owner.
              </p>
            ) : null}
          </div>

          {message ? (
            <div className="space-y-3">
              <FormAlert>{message}</FormAlert>

              {onRefreshAccess ? (
                <button
                  type="button"
                  onClick={onRefreshAccess}
                  disabled={pending}
                  className={secondaryButtonClass}
                >
                  Refresh access
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || offerRecheck}
              aria-busy={pending}
              aria-label={`Confirm leaving ${organizationName}`}
              className={dangerButtonClass}
            >
              {phase === "leaving"
                ? "Leaving…"
                : phase === "checking"
                  ? "Checking…"
                  : "Confirm leave"}
            </button>

            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={pending}
              className={secondaryButtonClass}
            >
              {offerRecheck ? "Keep me signed in" : "Cancel"}
            </button>
          </div>

          {offerRecheck ? (
            <button
              type="button"
              onClick={onRecheck}
              disabled={pending}
              className={`${secondaryButtonClass} w-full`}
            >
              Check my access
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
