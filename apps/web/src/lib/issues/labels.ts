import type { IssuePriority, IssueStatus, IssueType } from "./api";

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  READY_FOR_VERIFICATION: "Ready for verification",
  CLOSED: "Closed",
};

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  BUG: "Bug",
  DESIGN: "Design",
  CONTENT: "Content",
  SUGGESTION: "Suggestion",
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** Badge colours, built from the shared status tokens. */
export const ISSUE_STATUS_TONES: Record<IssueStatus, string> = {
  NEW: "border-status-new/40 bg-status-new/10 text-status-new-foreground",
  IN_PROGRESS:
    "border-status-in-progress/40 bg-status-in-progress/10 text-status-in-progress-foreground",
  READY_FOR_VERIFICATION:
    "border-status-qa-pending/40 bg-status-qa-pending-bg text-status-qa-pending-foreground",
  CLOSED: "border-border bg-surface-muted text-muted-foreground",
};

export const ISSUE_PRIORITY_TONES: Record<IssuePriority, string> = {
  LOW: "border-border bg-surface-muted text-muted-foreground",
  MEDIUM: "border-status-in-progress/40 bg-status-in-progress/10 text-status-in-progress-foreground",
  HIGH: "border-status-qa-pending/40 bg-status-qa-pending-bg text-status-qa-pending-foreground",
  CRITICAL: "border-status-blocked/40 bg-status-blocked/10 text-status-blocked-foreground",
};

/** `#12` — how an issue is referred to everywhere. */
export const issueReference = (number: number) => `#${number}`;

export function formatIssueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
