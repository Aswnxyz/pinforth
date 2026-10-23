import type { OrganizationSummary } from "./api";

export type OrganizationAccess =
  | { kind: "available"; organization: OrganizationSummary }
  | { kind: "unavailable" };

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
