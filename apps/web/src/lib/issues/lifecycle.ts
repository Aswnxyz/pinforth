import type { CloseReason, Issue, IssueStatus, UpdateIssueInput } from "./api";
import { CLOSE_REASON_LABELS, ISSUE_STATUS_LABELS } from "./labels";

/**
 * Which statuses the dropdown may move to. Mirrors the transition matrix in
 * docs/contracts/verification-v1.md §5.1: "Ready for verification" and
 * "Verified" are only reached by submitting and testing a fix, never picked.
 */
const ALLOWED: Record<IssueStatus, readonly IssueStatus[]> = {
  NEW: ["NEW", "IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["NEW", "IN_PROGRESS", "CLOSED"],
  READY_FOR_VERIFICATION: ["READY_FOR_VERIFICATION", "CLOSED"],
  VERIFIED: ["IN_PROGRESS", "VERIFIED", "CLOSED"],
  CLOSED: ["IN_PROGRESS", "CLOSED"],
};

const REOPENS: readonly IssueStatus[] = ["VERIFIED", "CLOSED"];

export function statusOptions(current: IssueStatus) {
  return ALLOWED[current].map((value) => ({
    value,
    label:
      value === "IN_PROGRESS" && REOPENS.includes(current)
        ? "Reopen (In progress)"
        : ISSUE_STATUS_LABELS[value],
  }));
}

export function statusHint(current: IssueStatus): string | undefined {
  switch (current) {
    case "NEW":
    case "IN_PROGRESS":
      return "“Ready for verification” is set by submitting a fix.";
    case "READY_FOR_VERIFICATION":
      return "Waiting for someone else to test the fix.";
    case "VERIFIED":
      return "A teammate tested the fix and it passed.";
    case "CLOSED":
      return undefined;
  }
}

/** Reasons a person can choose; `RESOLVED` only comes from closing a verified issue. */
export const UNVERIFIED_CLOSE_REASONS = ["WONT_FIX", "DUPLICATE", "NOT_A_BUG", "OTHER"] as const;
export const CLOSE_NOTE_MAX = 5000;

export interface CloseValues {
  reason: CloseReason | "";
  note: string;
}

/** The PATCH that closes the issue, or what is missing. */
export function prepareClose(
  from: IssueStatus,
  values: CloseValues,
): { input: UpdateIssueInput } | { errors: { closeReason?: string; closeNote?: string } } {
  const note = values.note.trim();
  if (note.length > CLOSE_NOTE_MAX) {
    return { errors: { closeNote: `Keep the note under ${CLOSE_NOTE_MAX.toLocaleString()} characters.` } };
  }
  // The API sets RESOLVED itself; sending any other reason here is refused.
  if (from === "VERIFIED") {
    return { input: { status: "CLOSED", ...(note ? { closeNote: note } : {}) } };
  }
  if (!values.reason || values.reason === "RESOLVED") {
    return { errors: { closeReason: "Choose why you’re closing it." } };
  }
  if (values.reason === "OTHER" && !note) {
    return { errors: { closeNote: "Add a short note explaining why." } };
  }
  return { input: { status: "CLOSED", closeReason: values.reason, ...(note ? { closeNote: note } : {}) } };
}

/** "Closed as Duplicate", for a closed issue. */
export function closedAs(issue: Pick<Issue, "status" | "closeReason">): string | null {
  if (issue.status !== "CLOSED" || !issue.closeReason) return null;
  return issue.closeReason === "RESOLVED" ? "Closed as resolved" : `Closed as ${CLOSE_REASON_LABELS[issue.closeReason]}`;
}
