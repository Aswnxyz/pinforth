import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Emails are compared case-insensitively, so normalise before validating.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address" }).max(320));

// NIST SP 800-63B: length matters, composition rules don't. No trimming —
// spaces are valid password characters.
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(160).optional(),
  })
  .refine((data) => data.password.trim().toLowerCase() !== data.email, {
    path: ["password"],
    message: "Password must not be your email address",
  });

export const loginSchema = z.object({
  email: emailSchema,
  // Don't enforce the length policy on login, or old/odd passwords leak policy errors.
  password: z.string().min(1, "Password is required").max(PASSWORD_MAX_LENGTH),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// Tokens are 43-char base64url; the bound just rejects junk early.
const emailTokenSchema = z.string().trim().min(16, "Invalid or expired link").max(256);

export const resetPasswordSchema = z.object({
  token: emailTokenSchema,
  password: passwordSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthMembership {
  organization: { id: string; name: string; slug: string };
  role: "OWNER" | "ADMIN" | "MEMBER";
}
