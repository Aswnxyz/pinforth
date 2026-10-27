import { OrganizationRoleBadge } from "@/components/workspace/organization-role-badge";
import type { OrganizationMember } from "@/lib/organizations/members-api";

/**
 * The people with access to a workspace.
 *
 * Presentational: it makes no requests and owns no state. It renders rows in
 * the order it is given, which is the backend's oldest-first order, and an
 * empty list only when the caller has a confirmed empty response — a failed
 * request is the caller's state to show, never this one.
 */
export function MembersList({
  members,
  canEdit = false,
  onEdit,
  canRemove,
  onRemove,
}: {
  members: readonly OrganizationMember[];
  /** OWNER-only role editing, decided by the caller from the org role. */
  canEdit?: boolean;
  /** Present when the caller may edit and no other member is being edited. */
  onEdit?: (member: OrganizationMember) => void;
  /** Per-row removal eligibility, decided by the caller from roles. */
  canRemove?: (member: OrganizationMember) => boolean;
  /** Present when the caller may remove and no other interaction is open. */
  onRemove?: (member: OrganizationMember) => void;
}) {
  if (members.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-base font-semibold text-foreground">
          No team members
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          There are no members to show for this workspace right now.
        </p>
      </section>
    );
  }

  return (
    <ul
      aria-label="Team members"
      className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs"
    >
      {members.map((member) => (
        <li
          key={member.id}
          className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
        >
          <div className="min-w-0">
            {/* min-w-0 on the row and the name lets a long name truncate
                instead of forcing the page to scroll sideways. */}
            <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-foreground">
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
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
            <OrganizationRoleBadge role={member.role} />
            <span className="text-xs leading-4 text-muted-foreground">
              Joined{" "}
              {new Date(member.joinedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            {canEdit && onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(member)}
                aria-label={`Edit role for ${member.user.name}`}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Edit role
              </button>
            ) : null}
            {onRemove && canRemove?.(member) ? (
              <button
                type="button"
                id={`remove-member-${member.id}`}
                onClick={() => onRemove(member)}
                aria-label={`Remove ${member.user.name} from this workspace`}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-danger/50 bg-surface-raised px-2.5 text-xs font-semibold text-danger shadow-xs transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
              >
                Remove
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
