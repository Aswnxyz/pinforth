"use client";

import { useEffect, useRef } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { issueReference } from "@/lib/issues/labels";

/**
 * The explicit second step before an issue is deleted. Presentational: the
 * parent sends the DELETE and owns `pending` and `message`.
 */
export function IssueDeleteCard({
  number,
  title,
  pending,
  message,
  confirmLabel = "Delete issue",
  onConfirm,
  onCancel,
}: {
  number: number;
  title: string;
  pending: boolean;
  message: string | null;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The safe choice gets focus, so a stray Enter never deletes.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby="delete-issue-title"
      className="space-y-4 rounded-xl border border-danger/40 bg-danger/5 p-5"
    >
      <div>
        <h2 id="delete-issue-title" className="text-base font-semibold text-foreground">
          Delete {issueReference(number)}?
        </h2>
        <p className="mt-1 text-sm leading-6 wrap-break-word text-muted-foreground">
          “{title}” will be removed for everyone in this workspace. This can’t be undone. To
          keep its history instead, set its status to Closed.
        </p>
      </div>

      {message ? <FormAlert>{message}</FormAlert> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-xs transition-colors hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Deleting…" : confirmLabel}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Keep issue
        </button>
      </div>
    </div>
  );
}
