import type { IssueApiOutcome } from "./api";
import type { ActivityEntry, IssueComment, TimelineEntry, TimelinePage } from "./comments-api";
import { CLOSE_REASON_LABELS, ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, ISSUE_TYPE_LABELS } from "./labels";

// Matches COMMENT_BODY_MAX_LENGTH in @pinforth/shared.
export const COMMENT_MAX = 10000;
const MAX_PAGES = 50;

/** Comment and activity ids come from different tables, so the key carries the type. */
export const entryKey = (entry: TimelineEntry) => `${entry.type}:${entry.id}`;

/**
 * Reads pages from `cursor` until at least `minCount` entries are in hand (or
 * the end). 0 reads one page; Infinity reads to the end.
 */
export async function readTimeline(
  fetchPage: (cursor: string | null) => Promise<IssueApiOutcome<TimelinePage>>,
  minCount: number,
  cursor: string | null = null,
): Promise<IssueApiOutcome<TimelinePage>> {
  const entries: TimelineEntry[] = [];
  let next = cursor;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const outcome = await fetchPage(next);
    if (outcome.status !== "success") return outcome;
    entries.push(...outcome.data.entries);
    next = outcome.data.nextCursor;
    if (!outcome.data.hasMore || entries.length >= minCount) {
      return { status: "success", data: { entries, nextCursor: next, hasMore: outcome.data.hasMore } };
    }
  }
  return { status: "success", data: { entries, nextCursor: next, hasMore: true } };
}

/** Appends a later page, dropping anything already shown. */
export function appendEntries(existing: readonly TimelineEntry[], later: readonly TimelineEntry[]) {
  const seen = new Set(existing.map(entryKey));
  return [...existing, ...later.filter((entry) => !seen.has(entryKey(entry)))];
}

/** Replaces a comment in place, or adds it at the end when it is new. */
export function upsertComment(entries: readonly TimelineEntry[], comment: IssueComment): TimelineEntry[] {
  const entry: TimelineEntry = { ...comment, type: "COMMENT" };
  const index = entries.findIndex((e) => e.type === "COMMENT" && e.id === comment.id);
  if (index === -1) return [...entries, entry];
  return entries.map((e, i) => (i === index ? entry : e));
}

export function markCommentDeleted(entries: readonly TimelineEntry[], commentId: string, at: string) {
  return entries.map((e) =>
    e.type === "COMMENT" && e.id === commentId && !e.deletedAt ? { ...e, body: null, deletedAt: at } : e,
  );
}

/**
 * After a POST whose outcome is unknown: the matching comment that wasn't on
 * screen before, if the re-read timeline has one.
 */
export function findPostedComment(
  entries: readonly TimelineEntry[],
  knownKeys: ReadonlySet<string>,
  userId: string,
  body: string,
) {
  return entries.find(
    (e) => e.type === "COMMENT" && !knownKeys.has(entryKey(e)) && e.author?.id === userId && e.body === body,
  );
}

export function actorName(actor: { name: string | null } | null): string {
  if (!actor) return "A former member";
  return actor.name?.trim() || "A team member";
}

const label = (labels: Record<string, string>, value: unknown) =>
  typeof value === "string" ? labels[value] ?? value : "unknown";

function personIn(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : "a team member";
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/** The deployment label snapshotted into fix and verification payloads. */
function deploymentIn(value: unknown): string {
  const deployment = field(value, "deploymentLabel");
  return typeof deployment === "string" && deployment ? deployment : "a deployment";
}

/** The sentence after the actor's name, e.g. "changed status from New to In progress". */
export function describeActivity(entry: ActivityEntry): string {
  const { oldValue, newValue } = entry;
  switch (entry.activityType) {
    case "STATUS_CHANGED":
      return `changed status from ${label(ISSUE_STATUS_LABELS, oldValue)} to ${label(ISSUE_STATUS_LABELS, newValue)}`;
    case "PRIORITY_CHANGED":
      return `changed priority from ${label(ISSUE_PRIORITY_LABELS, oldValue)} to ${label(ISSUE_PRIORITY_LABELS, newValue)}`;
    case "TYPE_CHANGED":
      return `changed type from ${label(ISSUE_TYPE_LABELS, oldValue)} to ${label(ISSUE_TYPE_LABELS, newValue)}`;
    case "ASSIGNEE_CHANGED": {
      const to = personIn(newValue);
      const from = personIn(oldValue);
      if (to) return `assigned this issue to ${to}`;
      return from ? `unassigned ${from}` : "unassigned this issue";
    }
    case "TITLE_CHANGED":
      return typeof newValue === "string" ? `changed the title to “${newValue}”` : "changed the title";
    case "DESCRIPTION_CHANGED":
      return "updated the description";
    case "FIX_SUBMITTED":
      return `submitted a fix in ${deploymentIn(newValue)}`;
    case "FIX_WITHDRAWN":
      return `withdrew the fix for ${deploymentIn(oldValue)}`;
    case "VERIFICATION_PASSED":
      return `verified the fix on ${deploymentIn(newValue)}${field(newValue, "selfVerified") === true ? " (self-verified)" : ""}`;
    case "VERIFICATION_FAILED":
      return `marked the fix as failed on ${deploymentIn(newValue)}`;
    case "ISSUE_CLOSED": {
      const reason = field(newValue, "closeReason");
      const note = field(newValue, "closeNote");
      const as =
        reason === "RESOLVED"
          ? "resolved"
          : typeof reason === "string" && reason in CLOSE_REASON_LABELS
            ? CLOSE_REASON_LABELS[reason as keyof typeof CLOSE_REASON_LABELS]
            : null;
      return `closed this issue${as ? ` as ${as}` : ""}${typeof note === "string" && note ? `: “${note}”` : ""}`;
    }
    case "ISSUE_REOPENED":
      return "reopened this issue";
    case "ISSUE_CREATED":
      return "opened this issue";
    default:
      return "updated this issue";
  }
}

export const canEditComment = (comment: IssueComment, userId: string | null) =>
  !comment.deletedAt && userId !== null && comment.author?.id === userId;

/** Authors delete their own; owners and admins can delete any. */
export const canDeleteComment = (comment: IssueComment, userId: string | null, isManager: boolean) =>
  !comment.deletedAt && (isManager || (userId !== null && comment.author?.id === userId));

export function validateCommentBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Write something first.";
  if (trimmed.length > COMMENT_MAX) return `Keep it under ${COMMENT_MAX.toLocaleString()} characters.`;
  return null;
}

export function formatTimelineTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const UNCONFIRMED_COMMENT_MESSAGE =
  "We couldn't confirm your comment was posted. Check the timeline before sending it again, so it isn't posted twice.";
export const UNCONFIRMED_EDIT_MESSAGE = "We couldn't confirm your edit was saved. Saving again is safe.";
export const UNCONFIRMED_COMMENT_DELETE_MESSAGE =
  "We couldn't confirm the comment was deleted. Deleting again is safe.";
