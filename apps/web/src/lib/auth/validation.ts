import { z } from "zod";

/**
 * Form validation for the authentication screens.
 *
 * Email and name limits mirror the existing Prisma `User` model. Password
 * rules are provisional: the model does not define them and the API contract
 * is not final, so they must be confirmed with the backend before they are
 * enforced server-side.
 */

/** Mirrors `User.email` (`VarChar(320)`). */
const EMAIL_MAX_LENGTH = 320;

/** Mirrors `User.name` (`VarChar(160)`). */
const NAME_MAX_LENGTH = 160;

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENT_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(EMAIL_MAX_LENGTH, "Email address is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(NAME_MAX_LENGTH, "Name is too long.");

export const loginPasswordSchema = z.string().min(1, "Enter your password.");

export const registerPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: registerPasswordSchema,
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export type AuthField = "name" | "email" | "password";

export type FieldErrors = Partial<Record<AuthField, string>>;

/** Collapses Zod issues into one message per field, keeping the first. */
export function fieldErrorsFrom(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (field !== "name" && field !== "email" && field !== "password") continue;
    if (errors[field]) continue;
    errors[field] = issue.message;
  }

  return errors;
}

/** Moves focus to the first field that failed validation. */
export function focusFirstInvalid(
  form: HTMLFormElement,
  fieldNames: readonly string[],
): void {
  const [first] = fieldNames;
  if (!first) return;

  const field = form.elements.namedItem(first);
  if (field instanceof HTMLElement) field.focus();
}
