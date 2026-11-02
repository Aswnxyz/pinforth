import type { OrganizationRole } from "@pinforth/shared";
import type { OrganizationMember } from "@/lib/organizations/members-api";

/**
 * Member-removal rules and wording.
 *
 * Mirrors the backend: anyone may leave by removing their own membership,
 * OWNER may remove anyone else, ADMIN may remove MEMBERs only, and the last
 * OWNER is never removable. UX gating only — the API decides.
 */

/** Whether this member's row may offer Remove to the signed-in caller. */
export function canRemoveMember(
  actorRole: OrganizationRole,
  member: Pick<OrganizationMember, "role" | "isYou">,
): boolean {
  // Self removal is the Leave workflow, never a row action.
  if (member.isYou) return false;

  if (actorRole === "OWNER") return true;

  return actorRole === "ADMIN" && member.role === "MEMBER";
}

/**
 * A synchronous latch for one non-idempotent request.
 *
 * React disables the confirm button only after it re-renders, so a second
 * click in the same tick could reach the handler first. `begin()` closes that
 * gap: only one DELETE leaves the page until `release()`.
 */
export function createSubmissionLock() {
  let inFlight = false;

  return {
    begin(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release(): void {
      inFlight = false;
    },
  };
}

/**
 * Whether leaving would remove the organization's only OWNER.
 *
 * The backend refuses that with 409; the UI only uses it for an explanation.
 */
export function isSoleOwnerLeaving(
  members: ReadonlyArray<Pick<OrganizationMember, "id" | "role">>,
  ownMemberId: string,
): boolean {
  const own = members.find((member) => member.id === ownMemberId);
  if (!own || own.role !== "OWNER") return false;

  return members.filter((member) => member.role === "OWNER").length === 1;
}

export const LAST_OWNER_REMOVAL_MESSAGE =
  "An organization must have at least one owner. Promote another member to " +
  "Owner before removing this member.";

export const LAST_OWNER_LEAVE_MESSAGE =
  "An organization must have at least one owner. Promote another member to " +
  "Owner before you leave this workspace.";

export const UNCONFIRMED_REMOVAL_MESSAGE =
  "We couldn’t confirm whether the member was removed — it may already have " +
  "gone through. Refresh the member list to check before trying again.";

export const REMOVAL_NOT_OBSERVED_MESSAGE =
  "The member is still in this workspace, so the removal was not applied. " +
  "You can try again.";

export const UNCONFIRMED_LEAVE_MESSAGE =
  "We couldn’t confirm whether you left this workspace — the change may " +
  "already have gone through. Check your access before trying again.";

export const LEAVE_STILL_MEMBER_MESSAGE =
  "You are still a member of this workspace, so the leave was not applied. " +
  "You can try again.";

/** The success feedback after the backend confirmed a removal. */
export function memberRemovedNotice(name: string): string {
  return `${name} was removed from this workspace.`;
}

/** Whether a fresh member list confirms the target is no longer a member. */
export function memberIsGone(
  members: ReadonlyArray<Pick<OrganizationMember, "id">>,
  memberId: string,
): boolean {
  return !members.some((member) => member.id === memberId);
}

/** Whether a fresh organization list confirms the workspace is out of reach. */
export function organizationIsGone(
  organizations: ReadonlyArray<{ id: string }>,
  organizationId: string,
): boolean {
  return !organizations.some((organization) => organization.id === organizationId);
}
