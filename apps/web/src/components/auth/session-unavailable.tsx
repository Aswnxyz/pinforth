"use client";

import { useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";

/**
 * Shown when the session could not be checked because the API is unreachable.
 *
 * It deliberately does not say that the user is signed out: the session may
 * still be perfectly valid, so the only honest thing to offer is a retry.
 */
export function SessionUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void> | void;
}) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);

    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Service unavailable
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          We could not reach Pinforth to check your session. This is usually
          temporary, and it does not mean you have been signed out.
        </p>
      </div>

      <FormAlert>{message}</FormAlert>

      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {retrying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}
