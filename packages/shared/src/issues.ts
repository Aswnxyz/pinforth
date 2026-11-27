import { z } from "zod";

export const issueTypeSchema = z.enum(["BUG", "DESIGN", "CONTENT", "SUGGESTION"]);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const issuePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type IssuePriority = z.infer<typeof issuePrioritySchema>;

export const issueStatusSchema = z.enum([
  "NEW",
  "IN_PROGRESS",
  "READY_FOR_VERIFICATION",
  "VERIFIED",
  "CLOSED",
]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueSourceSchema = z.enum(["DASHBOARD", "WIDGET"]);
export type IssueSource = z.infer<typeof issueSourceSchema>;

export const issueCloseReasonSchema = z.enum([
  "RESOLVED",
  "WONT_FIX",
  "DUPLICATE",
  "NOT_A_BUG",
  "OTHER",
]);
export type IssueCloseReason = z.infer<typeof issueCloseReasonSchema>;

export const CLOSE_NOTE_MAX_LENGTH = 5000;

const emptyToNull = (value: string) => (value === "" ? null : value);
const closeNoteSchema = z
  .string()
  .trim()
  .max(
    CLOSE_NOTE_MAX_LENGTH,
    `Close note must be at most ${CLOSE_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters`
  )
  .transform(emptyToNull)
  .nullable()
  .optional();

export const createIssueSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(255, "Title must be at most 255 characters"),
    description: z
      .string()
      .trim()
      .max(10000, "Description must be at most 10,000 characters")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    type: issueTypeSchema.default("BUG"),
    priority: issuePrioritySchema.default("MEDIUM"),
    assigneeId: z.string().uuid("Invalid assignee ID").nullable().optional(),
    environmentId: z.string().uuid("Invalid environment ID").nullable().optional(),
  })
  .strict();

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(255, "Title must be at most 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(10000, "Description must be at most 10,000 characters")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    type: issueTypeSchema.optional(),
    priority: issuePrioritySchema.optional(),
    status: issueStatusSchema.optional(),
    assigneeId: z.string().uuid("Invalid assignee ID").nullable().optional(),
    environmentId: z.string().uuid("Invalid environment ID").nullable().optional(),
    closeReason: issueCloseReasonSchema.optional(),
    closeNote: closeNoteSchema,
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.type !== undefined ||
      data.priority !== undefined ||
      data.status !== undefined ||
      data.assigneeId !== undefined ||
      data.environmentId !== undefined ||
      data.closeReason !== undefined ||
      data.closeNote !== undefined,
    {
      message: "Provide at least one field to update",
    }
  )
  .refine(
    (data) =>
      (data.closeReason === undefined && data.closeNote === undefined) ||
      data.status === "CLOSED",
    {
      message: "Close fields are only valid when closing an issue",
      path: ["status"],
    }
  );

export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export interface IssueUser {
  id: string;
  name: string | null;
  email: string;
}

export interface IssueGuest {
  name: string | null;
  email: string | null;
}

export interface IssueReviewRound {
  id: string;
  name: string;
}

export interface IssueAssignee {
  id: string;
  name: string | null;
  email: string;
}

export interface IssueEnvironment {
  id: string;
  name: string;
  slug: string;
}

export interface IssuePerson {
  id: string;
  name: string | null;
}

/** The fix currently awaiting verification, if any. */
export interface PendingFix {
  id: string;
  issueId: string;
  attemptNumber: number;
  deployment: {
    id: string;
    label: string;
    environmentId: string;
    createdAt: string;
  };
  submittedBy: IssuePerson | null;
  note: string | null;
  createdAt: string;
}

/** The passing verification currently backing a VERIFIED issue. */
export interface VerifiedOn {
  verificationId: string;
  deployment: {
    id: string;
    label: string;
  };
  verifiedBy: IssuePerson | null;
  selfVerified: boolean;
  verifiedAt: string;
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  source: IssueSource;
  environment: IssueEnvironment | null;
  reporter: IssueUser | null;
  guest?: IssueGuest | null;
  reviewRound?: IssueReviewRound | null;
  assignee: IssueAssignee | null;
  /** Non-deleted comments, both PUBLIC and INTERNAL. */
  commentsCount: number;
  closeReason: IssueCloseReason | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetail extends IssueSummary {
  description: string | null;
  projectId: string;
  pageUrl: string | null;
  context: unknown;
  /** Total fix submissions, including failed and withdrawn attempts. */
  attemptCount: number;
  pendingFix: PendingFix | null;
  verifiedOn: VerifiedOn | null;
  closeNote: string | null;
  closedAt: string | null;
  closedBy: IssuePerson | null;
}

export interface IssueStatusCounts {
  all: number;
  NEW: number;
  IN_PROGRESS: number;
  READY_FOR_VERIFICATION: number;
  VERIFIED: number;
  CLOSED: number;
}

export interface IssueListResponse {
  issues: IssueSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  counts: IssueStatusCounts;
}
