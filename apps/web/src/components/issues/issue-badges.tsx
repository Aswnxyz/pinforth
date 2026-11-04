import type { IssuePriority, IssueStatus } from "@/lib/issues/api";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_TONES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_TONES,
} from "@/lib/issues/labels";

const badgeClass =
  "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium";

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={`${badgeClass} ${ISSUE_STATUS_TONES[status]}`}>
      {ISSUE_STATUS_LABELS[status]}
    </span>
  );
}

export function IssuePriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <span className={`${badgeClass} ${ISSUE_PRIORITY_TONES[priority]}`}>
      {/* The word carries the meaning; colour only reinforces it. */}
      <span className="sr-only">Priority: </span>
      {ISSUE_PRIORITY_LABELS[priority]}
    </span>
  );
}
