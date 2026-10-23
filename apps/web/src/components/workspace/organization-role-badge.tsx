import type { OrganizationRole } from "@pinforth/shared";
import { ORGANIZATION_ROLE_LABELS } from "@/lib/organizations/api";

/**
 * The signed-in user's role in an organization, shown wherever an
 * organization is listed.
 */
export function OrganizationRoleBadge({ role }: { role: OrganizationRole }) {
  return (
    <span className="shrink-0 rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {ORGANIZATION_ROLE_LABELS[role]}
    </span>
  );
}
