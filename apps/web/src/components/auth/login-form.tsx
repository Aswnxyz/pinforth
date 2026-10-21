"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/ui/form-alert";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { POST_AUTH_REDIRECT, signInWithPassword } from "@/lib/auth/api";
import {
  emailSchema,
  fieldErrorsFrom,
  focusFirstInvalid,
  loginPasswordSchema,
  loginSchema,
  type FieldErrors,
} from "@/lib/auth/validation";

export function LoginForm() {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleChange(field: "email" | "password", value: string) {
    setValues((current) => ({ ...current, [field]: value }));

    // Only re-validate a field the user has already been told is wrong.
    setErrors((current) => {
      if (!current[field]) return current;

      const schema = field === "email" ? emailSchema : loginPasswordSchema;
      const result = schema.safeParse(value);
      const next = { ...current };

      if (result.success) {
        delete next[field];
      } else {
        next[field] = result.error.issues[0]?.message ?? "Check this value.";
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = loginSchema.safeParse(values);

    if (!result.success) {
      const fieldErrors = fieldErrorsFrom(result.error.issues);
      setErrors(fieldErrors);
      focusFirstInvalid(event.currentTarget, Object.keys(fieldErrors));
      return;
    }

    setErrors({});
    setPending(true);

    const outcome = await signInWithPassword(result.data);
    setPending(false);

    if (outcome.status === "success") {
      router.push(POST_AUTH_REDIRECT);
      return;
    }

    if (outcome.status === "rejected" && outcome.fields) {
      setErrors(outcome.fields);
    }

    setFormError(outcome.message);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        onChange={(value) => handleChange("email", value)}
        error={errors.email}
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        value={values.password}
        onChange={(value) => handleChange("password", value)}
        error={errors.password}
      />

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
