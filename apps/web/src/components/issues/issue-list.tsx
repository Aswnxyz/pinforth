import Link from "next/link";
import type { IssueSummary } from "@/lib/issues/api";
import {
  formatIssueDate,
  issueReference,
  ISSUE_TYPE_LABELS,
  personName,
} from "@/lib/issues/labels";
import { IssuePriorityBadge, IssueStatusBadge } from "./issue-badges";

/**
 * One row per issue, each linking to its detail page.
 *
 * Presentational: it makes no requests. The empty state is the caller's,
 * because "no issues yet" and "nothing matches these filters" read differently.
 */
export function IssueList({
  issues,
  issueHref,
}: {
  issues: readonly IssueSummary[];
  issueHref: (number: number) => string;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs">
      {issues.map((issue) => (
        <li key={issue.id}>
          <Link
            href={issueHref(issue.number)}
            className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {issueReference(issue.number)}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {issue.title}
                </span>
              </p>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                {ISSUE_TYPE_LABELS[issue.type]} · Opened {formatIssueDate(issue.createdAt)}
                {issue.reporter ? ` by ${personName(issue.reporter)}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IssueStatusBadge status={issue.status} />
              <IssuePriorityBadge priority={issue.priority} />
              <span className="max-w-40 truncate text-xs text-muted-foreground">
                {issue.assignee ? personName(issue.assignee) : "Unassigned"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
