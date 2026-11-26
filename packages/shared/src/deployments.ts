import { z } from "zod";

export const DEPLOYMENT_LABEL_MAX_LENGTH = 100;
export const DEPLOYMENT_COMMIT_SHA_MIN_LENGTH = 7;
export const DEPLOYMENT_COMMIT_SHA_MAX_LENGTH = 40;
export const DEPLOYMENT_URL_MAX_LENGTH = 2048;
export const DEPLOYMENT_NOTES_MAX_LENGTH = 2000;

const emptyToNull = (value: string) => (value === "" ? null : value);

export const deploymentLabelSchema = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(
    DEPLOYMENT_LABEL_MAX_LENGTH,
    `Label must be at most ${DEPLOYMENT_LABEL_MAX_LENGTH} characters`
  );

// Labels are unique per environment, case-sensitively, after trimming.
// Optional fields accept null, omitted, or blank input; blank becomes null.
const deploymentCommitShaSchema = z
  .string()
  .trim()
  .max(
    DEPLOYMENT_COMMIT_SHA_MAX_LENGTH,
    `Commit SHA must be at most ${DEPLOYMENT_COMMIT_SHA_MAX_LENGTH} characters`
  )
  .transform(emptyToNull)
  .nullable()
  .optional()
  .refine(
    (value) =>
      value == null ||
      new RegExp(
        `^[0-9a-fA-F]{${DEPLOYMENT_COMMIT_SHA_MIN_LENGTH},${DEPLOYMENT_COMMIT_SHA_MAX_LENGTH}}$`
      ).test(value),
    {
      error: `Commit SHA must be ${DEPLOYMENT_COMMIT_SHA_MIN_LENGTH} to ${DEPLOYMENT_COMMIT_SHA_MAX_LENGTH} hexadecimal characters`,
    }
  );

const deploymentUrlSchema = z
  .string()
  .trim()
  .max(
    DEPLOYMENT_URL_MAX_LENGTH,
    `URL must be at most ${DEPLOYMENT_URL_MAX_LENGTH} characters`
  )
  .transform(emptyToNull)
  .nullable()
  .optional()
  .refine(
    (value) => {
      if (value == null) return true;
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    },
    { error: "Enter a full website address starting with http:// or https://" }
  )
  .refine(
    (value) => {
      // Zod still runs this when the previous check failed; that error is
      // already reported, so don't throw on unparseable input here.
      if (value == null || !URL.canParse(value)) return true;
      const url = new URL(value);
      return url.username === "" && url.password === "";
    },
    { error: "Remove the username and password from the URL" }
  );

const deploymentNotesSchema = z
  .string()
  .trim()
  .max(
    DEPLOYMENT_NOTES_MAX_LENGTH,
    `Notes must be at most ${DEPLOYMENT_NOTES_MAX_LENGTH} characters`
  )
  .transform(emptyToNull)
  .nullable()
  .optional();

export const createDeploymentSchema = z
  .object({
    label: deploymentLabelSchema,
    commitSha: deploymentCommitShaSchema,
    url: deploymentUrlSchema,
    notes: deploymentNotesSchema,
  })
  .strict();

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;

export interface DeploymentCreator {
  id: string;
  name: string | null;
}

export interface Deployment {
  id: string;
  environmentId: string;
  label: string;
  commitSha: string | null;
  url: string | null;
  notes: string | null;
  createdBy: DeploymentCreator | null;
  createdAt: string;
}

export interface DeploymentListResponse {
  deployments: Deployment[];
  nextCursor: string | null;
}

/** The newest recorded deployment for an environment, not a live check. */
export interface LatestDeployment {
  id: string;
  label: string;
  createdAt: string;
}
