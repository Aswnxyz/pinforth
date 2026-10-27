"use client";

import type { ReactNode } from "react";

export function SubmitButton({
  pending,
  pendingLabel,
  disabled = false,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  /** Blocks submission without showing the pending state. */
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
