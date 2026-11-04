import {
  createIssueSchema,
  issuePrioritySchema,
  issueStatusSchema,
  issueTypeSchema,
  updateIssueSchema,
} from "@pinforth/shared";
import { z } from "zod";

export { createIssueSchema, updateIssueSchema };

export const listIssuesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: issueStatusSchema.optional(),
    type: issueTypeSchema.optional(),
    priority: issuePrioritySchema.optional(),
    assigneeId: z.union([z.string().uuid(), z.literal("me"), z.literal("unassigned")]).optional(),
    environmentId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const issueNumberParam = z.coerce.number().int().positive();
