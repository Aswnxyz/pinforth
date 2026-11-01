"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { OrganizationRole } from "@pinforth/shared";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ORGANIZATION_ROLE_LABELS } from "@/lib/organizations/api";
import type { OrganizationMember } from "@/lib/organizations/members-api";
import {
  roleChangeConfirmation,
  roleChangeConfirmationMessage,
  type RoleChangeConfirmationKind,
} from "@/lib/members/member-role";

const ROLE_OPTIONS: OrganizationRole[] = ["OWNER", "ADMIN", "MEMBER"];

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The role editor for one member.
 *
 * Presentational: it never makes requests and knows nothing about ids or
 * endpoints. The role starts from the backend-authoritative current role, and
 * high-privilege changes (granting OWNER, an OWNER stepping down) go through
 * an explicit confirmation before `onSubmit` is ever called. Values stay on
 * screen after a failure, and the parent remounts it per member id.
 */
export function MemberRoleEditor({
  member,
  onSubmit,
  onCancel,
  pending,
  message,
  offerRefresh = false,
  onRefreshMembers,
  onRefreshAccess,
}: {
  member: OrganizationMember;
  onSubmit: (role: OrganizationRole) => void;
  onCancel: () => void;
  pending: boolean;
  message?: string | null;
  /** Blocks another save until the unconfirmed change has been read back. */
  offerRefresh?: boolean;
  /** Present after an unconfirmed PATCH; reads the list back. */
  onRefreshMembers?: () => void;
  /** Present when the backend refused the caller's permission. */
  onRefreshAccess?: () => void;
}) {
  const selectId = useId();
  const [selected, setSelected] = useState<OrganizationRole>(member.role);
  const [confirming, setConfirming] =
    useState<RoleChangeConfirmationKind>("none");

  // Guards the window between a click and the parent's `pending` flipping, so
  // a fast second submit cannot fire before the button re-renders disabled.
  const submitting = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The parent finished an attempt (success or failure); accept input again.
    if (!pending) submitting.current = false;
  }, [pending]);

  useEffect(() => {
    if (confirming !== "none") confirmRef.current?.focus();
  }, [confirming]);

  const unchanged = selected === member.role;

  // The Edit role trigger disappears when this form opens, so focus moves
  // into the form instead of being lost to the document.
  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  function send() {
    if (pending || submitting.current || unchanged || offerRefresh) return;

    submitting.current = true;
    setConfirming("none");
    onSubmit(selected);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending || submitting.current || unchanged || offerRefresh) return;

    const confirmation = roleChangeConfirmation(member, selected);

    if (confirmation !== "none") {
      setConfirming(confirmation);
      return;
    }

    send();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-border bg-surface-raised p-6 shadow-xs"
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">Change role</h3>
        <p className="mt-1 flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate">{member.user.name}</span>
          {member.isYou ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              (You)
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm leading-5 break-all text-muted-foreground">
          {member.user.email}
        </p>
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
          Current role: {ORGANIZATION_ROLE_LABELS[member.role]}
        </p>
      </div>

      {message ? (
        <div className="space-y-3">
          <FormAlert>{message}</FormAlert>

          {onRefreshMembers ? (
            <button
              type="button"
              onClick={onRefreshMembers}
              disabled={pending}
              className={secondaryButtonClass}
            >
              Refresh members
            </button>
          ) : null}

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

      <div>
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground"
        >
          New role
        </label>
        <select
          id={selectId}
          ref={selectRef}
          value={selected}
          disabled={pending}
          onChange={(event) => {
            setSelected(event.target.value as OrganizationRole);
            setConfirming("none");
          }}
          className="mt-1.5 h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-56"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {ORGANIZATION_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      {/* A failure message replaces the confirmation: after an answered
          failure there is nothing left to confirm until Save is pressed
          again and the confirmation is recalculated. */}
      {confirming !== "none" && !message ? (
        <div className="space-y-3 rounded-md border border-status-qa-pending/40 bg-status-qa-pending-bg px-3 py-2.5">
          <p className="text-sm leading-6 text-status-qa-pending-foreground">
            {roleChangeConfirmationMessage(confirming, member, selected)}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              ref={confirmRef}
              type="button"
              onClick={send}
              disabled={pending || offerRefresh}
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirm change
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming("none");
                selectRef.current?.focus();
              }}
              disabled={pending}
              className={secondaryButtonClass}
            >
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <SubmitButton
            pending={pending}
            pendingLabel="Saving…"
            disabled={unchanged || offerRefresh}
          >
            Save changes
          </SubmitButton>

          <button
            type="button"
            onClick={onCancel}
            className={secondaryButtonClass + " w-full"}
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}
