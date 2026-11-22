import { apiFetch, type ApiResult } from "@/lib/auth/api";
import type { IssueApiOutcome } from "./api";

/**
 * Comments and the activity timeline of one issue.
 * Mirrors docs/contracts/issue-comments-timeline-v1.md.
 */

export const COMMENT_VISIBILITIES = ["PUBLIC", "INTERNAL"] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export interface TimelineActor {
  id: string;
  name: string | null;
}

export interface IssueComment {
  id: string;
  issueId: string;
  author: TimelineActor | null;
  /** Null once deleted: the entry stays as a tombstone. */
  body: string | null;
  visibility: CommentVisibility;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface CommentEntry extends IssueComment {
  type: "COMMENT";
}

export interface ActivityEntry {
  id: string;
  type: "ACTIVITY";
  /** Kept as a string so a type added later shows generically instead of failing the page. */
  activityType: string;
  actor: TimelineActor | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export type TimelineEntry = CommentEntry | ActivityEntry;

export interface TimelinePage {
  entries: TimelineEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** The API's maximum; most issues fit one page. */
export const TIMELINE_PAGE_SIZE = 100;

const MALFORMED_MESSAGE = "Pinforth received an unexpected response. Please refresh and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown) => value === null || isString(value);

export function isActor(value: unknown): value is TimelineActor {
  return isRecord(value) && isString(value.id) && isNullableString(value.name);
}

export function isComment(value: unknown): value is IssueComment {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.issueId) &&
    (value.author === null || isActor(value.author)) &&
    isNullableString(value.body) &&
    (COMMENT_VISIBILITIES as readonly unknown[]).includes(value.visibility) &&
    isString(value.createdAt) &&
    isNullableString(value.editedAt) &&
    isNullableString(value.deletedAt)
  );
}

function isEntry(value: unknown): value is TimelineEntry {
  if (!isRecord(value)) return false;
  if (value.type === "COMMENT") return isComment(value);
  return (
    value.type === "ACTIVITY" &&
    isString(value.id) &&
    isString(value.activityType) &&
    (value.actor === null || isActor(value.actor)) &&
    isString(value.createdAt)
  );
}

function toPage(data: unknown): TimelinePage | null {
  if (!isRecord(data) || !Array.isArray(data.timeline) || !data.timeline.every(isEntry)) return null;
  const pagination = data.pagination;
  if (!isRecord(pagination) || typeof pagination.hasMore !== "boolean") return null;
  if (!isNullableString(pagination.nextCursor)) return null;
  // A "more" page without a cursor could never be fetched.
  if (pagination.hasMore && !pagination.nextCursor) return null;
  return {
    entries: data.timeline,
    nextCursor: pagination.nextCursor as string | null,
    hasMore: pagination.hasMore,
  };
}

/** The API's message for the comment body, when it rejected one. */
function bodyMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const hit = details.find((d) => isRecord(d) && d.path === "body" && isString(d.message));
  return hit ? (hit as { message: string }).message : null;
}

function mapOutcome<Data>(res: ApiResult<unknown>, read: (data: unknown) => Data | null): IssueApiOutcome<Data> {
  if (res.ok) {
    const data = read(res.data);
    return data === null ? { status: "unavailable", message: MALFORMED_MESSAGE } : { status: "success", data };
  }
  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", message: res.message };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 409) return { status: "conflict", message: res.message };
  if (res.status === 0 || res.status >= 500) return { status: "unavailable", message: res.message };
  return { status: "rejected", message: bodyMessage(res.details) ?? res.message };
}

const readComment = (data: unknown) =>
  isRecord(data) && isComment(data.comment) ? data.comment : null;

const issuePath = (orgId: string, projectSlug: string, number: number) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectSlug)}/issues/${number}`;

const commentPath = (orgId: string, projectSlug: string, number: number, commentId: string) =>
  `${issuePath(orgId, projectSlug, number)}/comments/${encodeURIComponent(commentId)}`;

export async function listTimeline(
  orgId: string,
  projectSlug: string,
  number: number,
  cursor: string | null,
): Promise<IssueApiOutcome<TimelinePage>> {
  const query = new URLSearchParams({ limit: String(TIMELINE_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  const res = await apiFetch<unknown>(`${issuePath(orgId, projectSlug, number)}/timeline?${query}`, {
    method: "GET",
  });
  return mapOutcome(res, toPage);
}

export async function createComment(
  orgId: string,
  projectSlug: string,
  number: number,
  input: { body: string; visibility: CommentVisibility },
): Promise<IssueApiOutcome<IssueComment>> {
  const res = await apiFetch<unknown>(`${issuePath(orgId, projectSlug, number)}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapOutcome(res, readComment);
}

export async function editComment(
  orgId: string,
  projectSlug: string,
  number: number,
  commentId: string,
  body: string,
): Promise<IssueApiOutcome<IssueComment>> {
  const res = await apiFetch<unknown>(commentPath(orgId, projectSlug, number, commentId), {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  return mapOutcome(res, readComment);
}

/** Safe to repeat: deleting a deleted comment answers the same way. */
export async function deleteComment(
  orgId: string,
  projectSlug: string,
  number: number,
  commentId: string,
): Promise<IssueApiOutcome<{ deleted: true; commentId: string }>> {
  const res = await apiFetch<unknown>(commentPath(orgId, projectSlug, number, commentId), {
    method: "DELETE",
  });
  return mapOutcome(res, (data) =>
    isRecord(data) && data.deleted === true && isString(data.commentId)
      ? { deleted: true as const, commentId: data.commentId }
      : null,
  );
}
