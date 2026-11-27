"use client";

import { useRef, useState } from "react";
import type { VerificationApiOutcome } from "@/lib/issues/verification-api";
import { newMutationId } from "@/lib/issues/verification-values";
import { createRequestGuard } from "@/lib/projects/project-detail";

/**
 * Sends a fix or a test result under one `clientMutationId`. When the outcome
 * is unknown the exact request is kept, and only that is sent again, so the
 * API can answer with the original record. Any definite answer ends the id.
 */
export function useRetrySafeSend<Input extends { clientMutationId: string }, Data>(
  send: (input: Input) => Promise<VerificationApiOutcome<Data>>,
) {
  const [mutationId, setMutationId] = useState(newMutationId);
  const [pending, setPending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<Input | null>(null);
  const guard = useRef(createRequestGuard());

  /** Resolves null when a newer request replaced this one. */
  async function run(input: Input): Promise<VerificationApiOutcome<Data> | null> {
    const token = guard.current.start();
    setPending(true);

    const outcome = await send(input);
    if (!guard.current.accept(token)) return null;

    setPending(false);
    if (outcome.status === "unavailable") {
      setUnconfirmed(input);
    } else {
      setUnconfirmed(null);
      setMutationId(newMutationId());
    }
    return outcome;
  }

  return {
    /** The id for the next new request. */
    mutationId,
    pending,
    /** Set while the last request's outcome is unknown; edits are locked. */
    unconfirmed,
    run,
  };
}
