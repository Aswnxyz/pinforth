
import { z } from "zod";

export * from "./auth.js";

export const issueStatusSchema = z.enum([
  "new",
  "triaged",
  "in_progress",
  "ready_for_verification",
  "verified",
  "closed",
  "reopened",
  "deferred",
]);

export type IssueStatus = z.infer<
  typeof issueStatusSchema
>;
