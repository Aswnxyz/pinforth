"use client";

import { useRef, useState } from "react";
import { createRequestGuard } from "@/lib/projects/project-detail";
import {
  createGuestLink,
  revokeGuestLink,
  type CreatedGuestLink,
  type GuestLinkField,
} from "@/lib/review-rounds/api";
import {
  describeReviewFailure,
  toCreateGuestLinkInput,
  UNCONFIRMED_LINK_MESSAGE,
  UNCONFIRMED_REVOKE_MESSAGE,
  type GuestLinkValues,
} from "@/lib/review-rounds/review-values";
import { GuestLinkCreated, type RevokeState } from "./guest-link-created";
import { GuestLinkForm } from "./guest-link-form";

type Phase =
  | {
      kind: "form";
      pending: boolean;
      message: string | null;
      fields: Partial<Record<GuestLinkField, string>> | null;
      /** The last POST's outcome is unknown; another needs an explicit click. */
      unconfirmed: boolean;
    }
  | { kind: "created"; created: CreatedGuestLink; revoke: RevokeState };

const NEW_FORM: Phase = { kind: "form", pending: false, message: null, fields: null, unconfirmed: false };
const IDLE_REVOKE: RevokeState = { confirming: false, pending: false, message: null, revoked: false };

/**
 * Invites one reviewer to one round: the form, the one-time link, and
 * revoking it. Owns its requests; the page is told about outcomes it has to
 * handle (session over, round gone).
 */
export function InvitePanel({
  orgId,
  projectSlug,
  round,
  onClose,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  round: { id: string };
  onClose: () => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(NEW_FORM);
  const guard = useRef(createRequestGuard());

  async function handleCreate(values: GuestLinkValues) {
    const token = guard.current.start();
    setPhase((current) => ({
      ...NEW_FORM,
      pending: true,
      unconfirmed: current.kind === "form" && current.unconfirmed,
    }));

    const outcome = await createGuestLink(orgId, projectSlug, round.id, toCreateGuestLinkInput(values));
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      setPhase({ kind: "created", created: outcome.data, revoke: IDLE_REVOKE });
      return;
    }

    const failure = describeReviewFailure(outcome, UNCONFIRMED_LINK_MESSAGE);
    if (failure.kind === "login") return onLogin();
    if (failure.kind === "gone") return onGone();

    setPhase({
      kind: "form",
      pending: false,
      message: failure.message,
      fields: failure.kind === "message" ? failure.fields ?? null : null,
      unconfirmed: failure.kind === "refresh",
    });
  }

  function setRevoke(change: Partial<RevokeState>) {
    setPhase((current) =>
      current.kind === "created" ? { ...current, revoke: { ...current.revoke, ...change } } : current,
    );
  }

  async function handleRevoke(linkId: string) {
    const token = guard.current.start();
    setRevoke({ pending: true, message: null });

    const outcome = await revokeGuestLink(orgId, projectSlug, round.id, linkId);
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      setRevoke({ pending: false, confirming: false, revoked: true });
      return;
    }

    const failure = describeReviewFailure(outcome, UNCONFIRMED_REVOKE_MESSAGE);
    if (failure.kind === "login") return onLogin();
    if (failure.kind === "gone") return onGone();

    // Revoking is safe to repeat, so the confirm button simply stays offered.
    setRevoke({ pending: false, message: failure.message });
  }

  if (phase.kind === "created") {
    return (
      <GuestLinkCreated
        created={phase.created}
        revoke={phase.revoke}
        onRevokeStart={() => setRevoke({ confirming: true, message: null })}
        onRevokeConfirm={() => void handleRevoke(phase.created.guestLink.id)}
        onRevokeCancel={() => setRevoke({ confirming: false, message: null })}
        onDone={onClose}
      />
    );
  }

  return (
    <GuestLinkForm
      onSubmit={(values) => void handleCreate(values)}
      onCancel={onClose}
      pending={phase.pending}
      errorMessage={phase.message}
      fieldErrors={phase.fields}
      submitLabel={phase.unconfirmed ? "Create anyway" : "Create review link"}
    />
  );
}
