import { z } from "zod";
import type { IssueDetail } from "./issues.js";

export const FIX_NOTE_MAX_LENGTH = 5000;
export const VERIFICATION_NOTE_MAX_LENGTH = 5000;
export const CLIENT_MUTATION_ID_MAX_LENGTH = 128;

export const verificationResultSchema = z.enum(["PASS", "FAIL"]);
export type VerificationResult = z.infer<typeof verificationResultSchema>;

const clientMutationIdSchema = z
  .string()
  .trim()
  .min(1, "clientMutationId is required")
  .max(
    CLIENT_MUTATION_ID_MAX_LENGTH,
    `clientMutationId must be at most ${CLIENT_MUTATION_ID_MAX_LENGTH} characters`
  );

const emptyToNull = (value: string) => (value === "" ? null : value);

const noteSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max.toLocaleString("en-US")} characters`)
    .transform(emptyToNull)
    .nullable()
    .optional();

export const createFixSubmissionSchema = z
  .object({
    deploymentId: z.string().uuid("Invalid deployment ID"),
    note: noteSchema(FIX_NOTE_MAX_LENGTH, "Note"),
    clientMutationId: clientMutationIdSchema,
  })
  .strict();

export type CreateFixSubmissionInput = z.infer<typeof createFixSubmissionSchema>;

export const createVerificationSchema = z
  .object({
    fixSubmissionId: z.string().uuid("Invalid fix submission ID"),
    result: verificationResultSchema,
    note: noteSchema(VERIFICATION_NOTE_MAX_LENGTH, "Note"),
    deploymentId: z.string().uuid("Invalid deployment ID").nullable().optional(),
    clientMutationId: clientMutationIdSchema,
  })
  .strict()
  .refine((data) => data.result !== "FAIL" || data.note != null, {
    message: "A note is required when a verification fails",
    path: ["note"],
  });

export type CreateVerificationInput = z.infer<typeof createVerificationSchema>;

export interface FixActor {
  id: string;
  name: string | null;
}

/** The deployment a fix or verification was recorded against. */
export interface FixDeployment {
  id: string;
  label: string;
  environmentId: string;
  createdAt: string;
}

export interface FixSubmission {
  id: string;
  issueId: string;
  attemptNumber: number;
  deployment: FixDeployment;
  submittedBy: FixActor | null;
  note: string | null;
  clientMutationId: string;
  createdAt: string;
  withdrawnAt: string | null;
  withdrawnBy: FixActor | null;
}

export interface Verification {
  id: string;
  issueId: string;
  fixSubmissionId: string;
  deployment: FixDeployment;
  verifiedBy: FixActor | null;
  result: VerificationResult;
  note: string | null;
  selfVerified: boolean;
  createdAt: string;
}

/** One fix and its optional verification, ordered newest first. */
export interface Attempt {
  attempt: number;
  fix: FixSubmission;
  verification: Verification | null;
}

export interface AttemptHistoryResponse {
  attempts: Attempt[];
}

export interface CreateFixResponse {
  fix: FixSubmission;
  issue: IssueDetail;
}

export interface CreateVerificationResponse {
  verification: Verification;
  issue: IssueDetail;
}
