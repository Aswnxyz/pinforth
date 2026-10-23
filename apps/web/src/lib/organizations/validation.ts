import {
  createOrganizationSchema,
  organizationSlugSchema,
  slugify,
} from "@pinforth/shared";
import { z } from "zod";

/**
 * Organization form validation.
 *
 * Every rule comes from `@pinforth/shared`, which is the same schema the
 * backend validates against, so the form can never accept something the API
 * would reject.
 */

export { organizationSlugSchema };

/** Organization name rules: trimmed, 2 to 160 characters. */
export const organizationNameSchema = createOrganizationSchema.shape.name;

/**
 * The onboarding form's own shape. The slug is optional; an empty value
 * means "let the backend derive one from the name".
 */
export const organizationFormSchema = z.object({
  name: organizationNameSchema,
  slug: z.union([z.literal(""), organizationSlugSchema]).optional(),
});

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

/** The fields the organization form can show an error against. */
export type OrganizationFieldErrors = Partial<Record<"name" | "slug", string>>;

/** Collapses Zod issues into one message per field, keeping the first. */
export function organizationFieldErrors(
  issues: readonly z.ZodIssue[],
): OrganizationFieldErrors {
  const errors: OrganizationFieldErrors = {};

  for (const issue of issues) {
    const field = String(issue.path[0]);
    if (field !== "name" && field !== "slug") continue;
    errors[field] ??= issue.message;
  }

  return errors;
}

/**
 * The slug the backend will derive from this name, or `null` when the name
 * cannot produce one the API would accept — for example "AB" (too short) or
 * "!!!" (no letters or numbers).
 */
export function slugPreview(name: string): string | null {
  const parsed = organizationSlugSchema.safeParse(slugify(name.trim()));

  return parsed.success ? parsed.data : null;
}

/**
 * Whether the name needs a manually chosen slug. The form reveals the slug
 * field when this is true, instead of letting the request fail.
 *
 * An empty name is not a problem here: the name field reports that on its
 * own, and this would otherwise open the slug field before anything is typed.
 */
export function needsCustomSlug(name: string): boolean {
  const trimmed = name.trim();

  if (trimmed === "") return false;

  return slugPreview(trimmed) === null;
}
