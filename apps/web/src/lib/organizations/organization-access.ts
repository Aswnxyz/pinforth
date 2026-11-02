import type { OrganizationRole } from "@pinforth/shared";
import type { OrganizationSummary } from "./api";

export type OrganizationAccess =
  | { kind: "available"; organization: OrganizationSummary }
  | { kind: "unavailable" };

/**
 * Whether the signed-in member may create or edit projects in this
 * organization.
 *
 * UX gating only — it hides controls the backend would refuse anyway. The
 * API remains the authorization authority and can still answer `forbidden`.
 */
export function canManageProjects(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Whether the signed-in member may change organization members' roles.
 *
 * UX gating only, mirroring `canManageProjects`: the API is still the
 * authorization authority and answers `forbidden` on its own.
 */
export function canManageMembers(role: OrganizationRole): boolean {
  return role === "OWNER";
}

/**
 * Resolves a workspace slug against the organizations the signed-in user can
 * actually reach.
 *
 * A slug that is unknown and a slug the user has no access to produce the same
 * result on purpose. The response must not reveal whether an organization
 * exists, which is also how the backend behaves for non-members.
 *
 * The comparison ignores case because slugs are always stored lowercase.
 */
export function resolveOrganizationAccess(
  organizations: ReadonlyArray<OrganizationSummary>,
  slug: string,
): OrganizationAccess {
  const target = slug.toLowerCase();

  const organization = organizations.find(
    (candidate) => candidate.slug.toLowerCase() === target,
  );

  return organization
    ? { kind: "available", organization }
    : { kind: "unavailable" };
}
