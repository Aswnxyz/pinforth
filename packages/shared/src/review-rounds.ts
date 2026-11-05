import { z } from "zod";

export const reviewRoundStatusSchema = z.enum(["ACTIVE", "CLOSED", "ARCHIVED"]);
export type ReviewRoundStatus = z.infer<typeof reviewRoundStatusSchema>;

export const createReviewRoundSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(180, "Name must be at most 180 characters"),
    environmentId: z.string().uuid("Invalid environment ID"),
    description: z
      .string()
      .trim()
      .max(5000, "Description must be at most 5,000 characters")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
  })
  .strict();

export type CreateReviewRoundInput = z.infer<typeof createReviewRoundSchema>;

export const createGuestLinkSchema = z
  .object({
    reviewerName: z
      .string()
      .trim()
      .min(1)
      .max(160, "Reviewer name must be at most 160 characters")
      .nullable()
      .optional(),
    reviewerEmail: z
      .string()
      .trim()
      .email("Invalid reviewer email address")
      .max(320, "Reviewer email must be at most 320 characters")
      .nullable()
      .optional(),
    expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
  })
  .strict();

export type CreateGuestLinkInput = z.infer<typeof createGuestLinkSchema>;

export const guestExchangeSchema = z
  .object({
    token: z.string().trim().min(1, "Invitation token is required"),
  })
  .strict();

export type GuestExchangeInput = z.infer<typeof guestExchangeSchema>;

export interface ReviewRoundEnvironment {
  id: string;
  name: string;
  slug: string;
  url: string;
}

export interface ReviewRoundSummary {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  description: string | null;
  status: ReviewRoundStatus;
  environment: ReviewRoundEnvironment;
  activeLinksCount?: number;
  issuesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuestLinkSummary {
  id: string;
  reviewRoundId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}
