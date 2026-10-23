import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  emailSchema as sharedEmailSchema,
} from "@pinforth/shared";
import { z } from "zod";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };

export const PASSWORD_REQUIREMENT_HINT = `At least ${PASSWORD_MIN_LENGTH} characters.`;

/** Mirrors `User.name` (`VarChar(160)`). Required for registration. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your full name.")
  .max(160, "Name is too long.");

/** Email with user-friendly error messages and length limit. */
export const emailSchema = sharedEmailSchema;

/** Login password enforces presence and max length without leaking length policy. */
export const loginPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

/** Registration password enforces NIST 800-63B length without composition rules. */
export const registerPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: registerPasswordSchema,
  })
  .refine((data) => data.password.trim().toLowerCase() !== data.email.trim().toLowerCase(), {
    path: ["password"],
    message: "Password must not be your email address.",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export type AuthField = "name" | "email" | "password";

export type FieldErrors = Partial<Record<AuthField, string>>;

/** Collapses Zod issues into one message per field, keeping the first. */
export function fieldErrorsFrom(issues: readonly z.ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = String(issue.path[0]);
    if (field !== "name" && field !== "email" && field !== "password") continue;
    if (errors[field as AuthField]) continue;
    errors[field as AuthField] = issue.message;
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
