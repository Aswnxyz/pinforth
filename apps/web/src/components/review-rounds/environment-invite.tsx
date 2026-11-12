"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { InlineLoading } from "@/components/issues/issue-page-shell";
import { FormAlert } from "@/components/ui/form-alert";
import {
  findOrCreateEnvironmentRound,
  type EnvironmentRoundOutcome,
} from "@/lib/review-rounds/environment-round";
import { InvitePanel } from "./invite-panel";

/**
 * Invites a reviewer to one environment. The review round it needs is found
 * or created first, without the user ever having to think about rounds.
 */
export function EnvironmentInvite({
  orgId,
  projectSlug,
  environment,
  onClose,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  environment: { id: string; name: string };
  onClose: () => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; outcome: EnvironmentRoundOutcome } | null>(null);
  // Strict mode runs effects twice; two lookups could create two rounds.
  const inFlight = useRef<{ attempt: number; request: Promise<EnvironmentRoundOutcome> } | null>(null);

  const prepare = useEffectEvent(() => findOrCreateEnvironmentRound(orgId, projectSlug, environment));
  const settle = useEffectEvent((forAttempt: number, outcome: EnvironmentRoundOutcome) => {
    if (outcome.status === "login") onLogin();
    else if (outcome.status === "gone") onGone();
    else setResult({ attempt: forAttempt, outcome });
  });

  useEffect(() => {
    let cancelled = false;
    if (!inFlight.current || inFlight.current.attempt !== attempt) {
      inFlight.current = { attempt, request: prepare() };
    }
    inFlight.current.request.then((outcome) => {
      if (!cancelled) settle(attempt, outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const outcome = result && result.attempt === attempt ? result.outcome : null;

  if (!outcome || outcome.status === "login" || outcome.status === "gone") {
    return <InlineLoading label="Getting the invite ready…" />;
  }

  if (outcome.status === "failed") {
    return (
      <div className="space-y-3">
        <FormAlert>{outcome.message}</FormAlert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setAttempt((count) => count + 1)}
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <InvitePanel
      orgId={orgId}
      projectSlug={projectSlug}
      round={outcome.round}
      onClose={onClose}
      onGone={onGone}
      onLogin={onLogin}
    />
  );
}
