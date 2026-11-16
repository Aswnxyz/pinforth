import { formatIssueDate } from "@/lib/issues/labels";
import type { EnvironmentGuestLink } from "./api";

export function reviewerName(link: EnvironmentGuestLink): string {
  return link.reviewerName ?? link.reviewerEmail ?? "Unnamed reviewer";
}

/** Active links first in the list; expired and revoked ones are history. */
export function splitReviewers(links: readonly EnvironmentGuestLink[]) {
  return {
    active: links.filter((link) => link.status === "ACTIVE"),
    past: links.filter((link) => link.status !== "ACTIVE"),
  };
}

export function reviewerAccessLine(link: EnvironmentGuestLink): string {
  if (link.status === "REVOKED") return `Revoked ${formatIssueDate(link.revokedAt ?? link.expiresAt)}`;
  if (link.status === "EXPIRED") return `Expired ${formatIssueDate(link.expiresAt)}`;
  return `Link works until ${formatIssueDate(link.expiresAt)}`;
}

/** `lastOpenedAt` is set by the widget, so "never" can also mean it isn't installed. */
export function reviewerActivityLine(link: EnvironmentGuestLink): string {
  const visit = link.lastOpenedAt
    ? `Last on the site ${formatIssueDate(link.lastOpenedAt)}`
    : "Not on the site yet";
  const issues = link.issuesCount === 1 ? "1 issue" : `${link.issuesCount} issues`;
  return `${visit} · ${issues}`;
}

export function reviewersSummary(activeCount: number): string {
  if (activeCount === 0) return "No active reviewers";
  return activeCount === 1 ? "1 active reviewer" : `${activeCount} active reviewers`;
}

/** The list after a confirmed revoke, without waiting for a reload. */
export function markRevoked(
  links: readonly EnvironmentGuestLink[],
  linkId: string,
  at: string,
): EnvironmentGuestLink[] {
  return links.map((link) =>
    link.id === linkId && link.status !== "REVOKED"
      ? { ...link, status: "REVOKED", revokedAt: at }
      : link,
  );
}
