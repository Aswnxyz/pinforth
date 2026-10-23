"use client";

import { FormAlert } from "@/components/ui/form-alert";

/**
 * The shared states of the workspace routes.
 *
 * Both are used while the workspace list is being resolved, so they stay
 * identical across the chooser and a single workspace.
 */

export function WorkspaceLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface text-foreground">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
        />
        Loading your workspace…
      </div>
    </div>
  );
}

export function WorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Workspaces unavailable
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          We could not load your workspaces. This is usually temporary.
        </p>
      </div>

      <FormAlert>{message}</FormAlert>

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Try again
      </button>
    </div>
  );
}
