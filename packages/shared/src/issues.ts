import { z } from "zod";

export const issueTypeSchema = z.enum(["BUG", "DESIGN", "CONTENT", "SUGGESTION"]);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const issuePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type IssuePriority = z.infer<typeof issuePrioritySchema>;

export const issueStatusSchema = z.enum(["NEW", "IN_PROGRESS", "READY_FOR_VERIFICATION", "CLOSED"]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueSourceSchema = z.enum(["DASHBOARD", "WIDGET"]);
export type IssueSource = z.infer<typeof issueSourceSchema>;

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
      data.environmentId !== undefined,
    {
      message: "Provide at least one field to update",
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
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetail extends IssueSummary {
  description: string | null;
  projectId: string;
  pageUrl: string | null;
  context: unknown;
}

export interface IssueStatusCounts {
  all: number;
  NEW: number;
  IN_PROGRESS: number;
  READY_FOR_VERIFICATION: number;
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
