import type { OrganizationRole } from "@pinforth/shared";
import {
  describeMemberFailure,
  type MemberFailure,
} from "@/lib/members/member-failure";
import { ORGANIZATION_ROLE_LABELS } from "@/lib/organizations/api";
import type {
  MemberApiOutcome,
  OrganizationMember,
} from "@/lib/organizations/members-api";

/**
 * Role-change logic for the members list.
 *
 * The pure pieces of the editor: when a change needs explicit confirmation,
 * how a failed PATCH is explained, and how a backend-confirmed or freshly
 * read role is reconciled into the list. Kept free of React so every branch
 * is unit-testable.
 */

export type RoleChangeConfirmationKind =
  | "none"
  | "grant-owner"
  | "self-demotion";

/**
 * Whether this role change needs an explicit confirmation first.
 *
 * Granting OWNER is high-privilege. Demoting yourself is the other case the
 * backend guards: the organization must keep at least one OWNER, and the
 * caller loses their own owner access.
 */
export function roleChangeConfirmation(
  member: Pick<OrganizationMember, "isYou" | "role">,
  nextRole: OrganizationRole,
): RoleChangeConfirmationKind {
  if (nextRole === member.role) return "none";

  if (member.isYou && member.role === "OWNER") return "self-demotion";

  if (nextRole === "OWNER") return "grant-owner";

  return "none";
}

/** The warning shown before a confirmed high-privilege change, if any. */
export function roleChangeConfirmationMessage(
  kind: RoleChangeConfirmationKind,
  member: Pick<OrganizationMember, "user">,
  nextRole: OrganizationRole,
): string | null {
  switch (kind) {
    case "none":
      return null;
    case "grant-owner":
      return `${member.user.name} will be able to manage members, roles, projects, and workspace settings. Give ${member.user.name} the Owner role?`;
    case "self-demotion":
      return `You are changing your own role from Owner to ${ORGANIZATION_ROLE_LABELS[nextRole]}. You will lose owner access to this workspace. The organization must keep at least one Owner.`;
  }
}

/**
 * What a failed role PATCH can tell the page.
 */
export type RoleChangeFailure = MemberFailure;

export const LAST_OWNER_MESSAGE =
  "An organization must have at least one owner. Promote another member to " +
  "Owner before changing this member’s role.";

export const UNCONFIRMED_ROLE_CHANGE_MESSAGE =
  "We couldn’t confirm whether the role change was saved — it may still " +
  "have gone through. Refresh the member list to check before trying again.";

export const ROLE_CHANGE_NOT_SAVED_MESSAGE =
  "The role change was not saved. Review the role and try saving again.";

/**
 * Maps a failed PATCH to what the page should do. The switch is exhaustive so
 * no outcome is silently dropped.
 */
export function describeRoleChangeFailure(
  outcome: Exclude<MemberApiOutcome<OrganizationMember>, { status: "success" }>,
): MemberFailure {
  return describeMemberFailure(outcome, {
    lastOwnerMessage: LAST_OWNER_MESSAGE,
    unconfirmedMessage: UNCONFIRMED_ROLE_CHANGE_MESSAGE,
  });
}

/**
 * Applies the member the backend confirmed, by membership id, keeping the
 * backend's order. The list is never extended with a member it did not have.
 */
export function replaceMember(
  members: readonly OrganizationMember[],
  updated: OrganizationMember,
): OrganizationMember[] {
  return members.map((member) =>
    member.id === updated.id ? updated : member,
  );
}

/**
 * Whether a fresh list shows the submitted role on the submitted membership.
 *
 * The conclusive reconciliation check after an unconfirmed PATCH. It proves
 * the role is live, not which request put it there — under concurrent edits
 * the editor keeps its refresh offer rather than claiming causality.
 */
export function roleChangeLanded(
  members: readonly OrganizationMember[],
  memberId: string,
  role: OrganizationRole,
): boolean {
  return members.some(
    (member) => member.id === memberId && member.role === role,
  );
}
