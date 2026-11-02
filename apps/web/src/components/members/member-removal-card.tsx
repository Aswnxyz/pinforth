"use client";

import { useEffect, useRef } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { OrganizationRoleBadge } from "@/components/workspace/organization-role-badge";
import type { OrganizationMember } from "@/lib/organizations/members-api";

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The confirmation for removing one member.
 *
 * Presentational: it makes no request and knows nothing about ids. The parent
 * only opens it after an explicit click on the row's Remove action, so this
 * card is the second step, never the trigger. Cancel takes focus on open, so
 * the destructive button is never one accidental Enter away.
 */
export function MemberRemovalCard({
  member,
  pending,
  message = null,
  offerRefresh = false,
  onConfirm,
  onCancel,
  onRefreshMembers,
  onRefreshAccess,
}: {
  member: OrganizationMember;
  pending: boolean;
  message?: string | null;
  /** Blocks another attempt until an unconfirmed removal has been checked. */
  offerRefresh?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Present after an unconfirmed DELETE; reads the list back. */
  onRefreshMembers?: () => void;
  /** Present when the backend refused the caller's permission. */
  onRefreshAccess?: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <section className="space-y-5 rounded-xl border border-danger/40 bg-surface-raised p-6 shadow-xs">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">
          Remove member
        </h3>
        <p className="mt-1 flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate">{member.user.name}</span>
        </p>
        <p className="mt-0.5 text-sm leading-5 break-all text-muted-foreground">
          {member.user.email}
        </p>
        <div className="mt-2">
          <OrganizationRoleBadge role={member.role} />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Removing {member.user.name}’s membership revokes their access to this
          workspace and its projects.
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || offerRefresh}
          aria-busy={pending}
          aria-label={`Confirm removal of ${member.user.name}`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-xs transition-colors hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Removing…" : "Confirm removal"}
        </button>

        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
