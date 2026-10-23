"use client";

import { FormAlert } from "@/components/ui/form-alert";
import { useAuth } from "@/lib/auth/context";

const BUTTON =
  "inline-flex items-center rounded-md border border-border-strong bg-surface-raised text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The sign-out control.
 *
 * Signing out is only reported as done once the server confirmed it, so the
 * button is disabled while the request is in flight rather than clearing the
 * session optimistically.
 */
export function SignOutButton({
  className,
  label = "Sign out",
  pendingLabel = "Signing out…",
}: {
  className?: string;
  label?: string;
  pendingLabel?: string;
}) {
  const { signOut, isSigningOut } = useAuth();

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isSigningOut}
      aria-busy={isSigningOut}
      className={`${BUTTON} ${className ?? ""}`}
    >
      {isSigningOut ? pendingLabel : label}
    </button>
  );
}

/**
 * Shown under the header when a sign-out could not be confirmed.
 *
 * The session may still be alive on the server, so the message says so instead
 * of pretending the user was signed out, and offers the retry.
 */
export function SignOutError() {
  const { signOutError } = useAuth();

  if (!signOutError) return null;

  return (
    <div className="border-t border-border px-4 py-2.5 sm:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <FormAlert>{signOutError}</FormAlert>
        </div>
        <SignOutButton
          className="h-9 shrink-0"
          label="Try again"
          pendingLabel="Trying again…"
        />
      </div>
    </div>
  );
}
