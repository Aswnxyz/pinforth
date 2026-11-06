"use client";

import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import {
  exchangeGuestInvitation,
  readInvitationToken,
  type GuestExchangeOutcome,
  type GuestHandoff,
} from "@/lib/guest/api";

type PageState =
  | { kind: "reading" }
  | { kind: "missing" }
  | { kind: "exchanging" }
  | { kind: "opening"; handoff: GuestHandoff }
  | { kind: "failed"; outcome: Exclude<GuestExchangeOutcome, { status: "success" }> };

const primaryButton =
  "inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto";

/**
 * The landing page of a guest review link: `/review#token=pf_gr_…`.
 *
 * The secret only ever lives in the fragment, which browsers never send to a
 * server. It is removed from the address bar before anything else happens,
 * held in memory, exchanged for a one-time code, and the guest is sent on to
 * the website, where the feedback widget takes over.
 */
export function ReviewContent() {
  const [token, setToken] = useState<string | null>(null);
  const [page, setPage] = useState<PageState>({ kind: "reading" });
  const [attempt, setAttempt] = useState(0);
  // Strict mode runs effects twice; one exchange per attempt is enough.
  const inFlight = useRef<{ attempt: number; request: Promise<GuestExchangeOutcome> } | null>(null);

  useEffect(() => {
    const found = readInvitationToken(window.location.hash);
    // Off the address bar and out of history before any request is made.
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    Promise.resolve().then(() => {
      if (found) setToken((current) => current ?? found);
      else setPage((current) => (current.kind === "reading" ? { kind: "missing" } : current));
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    if (!inFlight.current || inFlight.current.attempt !== attempt) {
      inFlight.current = { attempt, request: exchangeGuestInvitation(token) };
    }

    Promise.resolve().then(() => {
      if (!cancelled) setPage({ kind: "exchanging" });
    });

    inFlight.current.request.then((outcome) => {
      if (cancelled) return;
      if (outcome.status === "success") {
        setPage({ kind: "opening", handoff: outcome.data });
        // Replace, so Back doesn't return to a page whose secret is gone.
        window.location.replace(outcome.data.stagingUrl);
        return;
      }
      setPage({ kind: "failed", outcome });
    });

    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  switch (page.kind) {
    case "reading":
    case "exchanging":
      return <Working title="Checking your review link…" />;

    case "missing":
      return (
        <Message
          title="Open your review link again"
          body="This page needs the full link you were sent. Open it again from the message, or ask the person who invited you for a new one."
        />
      );

    case "opening": {
      const { handoff } = page;
      return (
        <div className="space-y-4">
          <Working
            title={`Opening ${handoff.reviewRound.name}…`}
            body={
              handoff.reviewer.name
                ? `You’re reviewing as ${handoff.reviewer.name}. The website opens with a Feedback button.`
                : "The website opens with a Feedback button."
            }
          />
          <a href={handoff.stagingUrl} className={primaryButton}>
            Open the website
          </a>
        </div>
      );
    }

    case "failed":
      return <Failure outcome={page.outcome} onRetry={() => setAttempt((count) => count + 1)} />;
  }
}

function Failure({
  outcome,
  onRetry,
}: {
  outcome: Exclude<GuestExchangeOutcome, { status: "success" }>;
  onRetry: () => void;
}) {
  switch (outcome.status) {
    case "denied":
      return (
        <Message
          title="This review link no longer works"
          body="It may have expired or been revoked. Ask the person who invited you for a new link."
          detail={outcome.message}
        />
      );
    case "closed":
      return (
        <Message
          title="This review has ended"
          body="The team isn’t collecting feedback for this review any more. Thanks for your help."
        />
      );
    case "rate-limited":
    case "unavailable":
      return (
        <div className="space-y-4">
          <Message title="We couldn’t open your review" detail={outcome.message} />
          <button type="button" onClick={onRetry} className={primaryButton}>
            Try again
          </button>
        </div>
      );
  }
}

function Working({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-1.5 size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {body ? <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p> : null}
      </div>
    </div>
  );
}

function Message({ title, body, detail }: { title: string; body?: string; detail?: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {body ? <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p> : null}
      </div>
      {detail ? <FormAlert>{detail}</FormAlert> : null}
    </div>
  );
}
