import { z } from "zod";

export const organizationRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "Acme Studio & Co." -> "acme-studio-co". Shared so the web form can preview it.
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens");

const organizationNameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(160);

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  // Derived from the name when omitted.
  slug: organizationSlugSchema.optional(),
});

export const updateOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
