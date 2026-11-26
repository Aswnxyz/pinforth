import { z } from "zod";

export const COMMENT_BODY_MAX_LENGTH = 10000;

export const commentVisibilitySchema = z.enum(["PUBLIC", "INTERNAL"]);
export type CommentVisibility = z.infer<typeof commentVisibilitySchema>;

const commentBodySchema = z
  .string()
  .trim()
  .min(1, "Comment is required")
  .max(COMMENT_BODY_MAX_LENGTH, "Comment must be at most 10,000 characters");

export const createCommentSchema = z
  .object({
    body: commentBodySchema,
    visibility: commentVisibilitySchema.default("PUBLIC"),
  })
  .strict();

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z
  .object({
    body: commentBodySchema,
  })
  .strict();

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const issueActivityTypeSchema = z.enum([
  "ISSUE_CREATED",
  "STATUS_CHANGED",
  "PRIORITY_CHANGED",
  "TYPE_CHANGED",
  "ASSIGNEE_CHANGED",
  "TITLE_CHANGED",
  "DESCRIPTION_CHANGED",
  "FIX_SUBMITTED",
  "FIX_WITHDRAWN",
  "VERIFICATION_PASSED",
  "VERIFICATION_FAILED",
  "ISSUE_CLOSED",
  "ISSUE_REOPENED",
]);
export type IssueActivityType = z.infer<typeof issueActivityTypeSchema>;

export interface TimelineActor {
  id: string;
  name: string | null;
}

export interface IssueComment {
  id: string;
  issueId: string;
  author: TimelineActor | null;
  /** Null once the comment is soft-deleted. */
  body: string | null;
  visibility: CommentVisibility;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface IssueCommentEntry extends IssueComment {
  type: "COMMENT";
}

/**
 * Lifecycle activities carry structured payloads (fix ids, deployment labels,
 * verification results). Keep this open so a payload added later is rendered
 * generically instead of failing the page.
 */
export type IssueActivityValue =
  | string
  | number
  | boolean
  | TimelineActor
  | Record<string, unknown>
  | null;

export interface IssueActivityEntry {
  id: string;
  type: "ACTIVITY";
  activityType: IssueActivityType;
  actor: TimelineActor | null;
  oldValue: IssueActivityValue;
  newValue: IssueActivityValue;
  createdAt: string;
}

export type IssueTimelineEntry = IssueCommentEntry | IssueActivityEntry;

export interface IssueTimelineResponse {
  timeline: IssueTimelineEntry[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}
