"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import {
  ENVIRONMENT_NAME_MAX,
  ENVIRONMENT_URL_MAX,
  validateEnvironmentValues,
  type EnvironmentFieldErrors,
  type EnvironmentValues,
} from "@/lib/projects/environment-validation";

/**
 * The website-environment form.
 *
 * The same component creates and edits: the mode changes only the heading,
 * the submit label and the starting values. It never makes network requests
 * and knows nothing about organization, project or environment ids — the
 * future parent supplies `onSubmit`, `pending`, `errorMessage` and
 * `fieldErrors`, and owns all ids and endpoints.
 *
 * Values start from `initialValues` on mount only. When editing a different
 * environment, the parent remounts the form with a stable environment id as
 * its React key, so an in-progress edit is never overwritten by an effect.
 */
export function EnvironmentForm({
  mode,
  initialValues,
  onSubmit,
  pending,
  errorMessage,
  fieldErrors,
  onCancel,
}: {
  mode: "create" | "edit";
  /** Prefills the fields in edit mode; create mode starts empty. */
  initialValues?: EnvironmentValues;
  onSubmit: (values: EnvironmentValues) => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: EnvironmentFieldErrors | null;
  /** Closes the form without saving, when provided by the parent. */
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [localErrors, setLocalErrors] = useState<EnvironmentFieldErrors>({});

  // Guards the window between a click and the parent's `pending` flipping, so
  // a fast second submit cannot fire before the button re-renders disabled.
  const submitting = useRef(false);

  useEffect(() => {
    // The parent finished an attempt (success or failure); accept input again.
    if (!pending) submitting.current = false;
  }, [pending]);

  function clearLocalError(field: keyof EnvironmentFieldErrors) {
    setLocalErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current || pending) return;

    const result = validateEnvironmentValues({ name, url });

    if (!result.ok) {
      setLocalErrors(result.errors);
      focusFirstInvalid(event.currentTarget, Object.keys(result.errors));
      return;
    }

    submitting.current = true;
    setLocalErrors({});

    onSubmit(result.values);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      <h3 className="text-base font-semibold text-foreground">
        {mode === "create" ? "Add environment" : "Edit environment"}
      </h3>

      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <TextField
        label="Environment name"
        name="name"
        required
        maxLength={ENVIRONMENT_NAME_MAX}
        placeholder="Staging"
        hint="How this website location is known, for example Staging or Production."
        value={name}
        onChange={(value) => {
          setName(value);
          clearLocalError("name");
        }}
        error={localErrors.name ?? fieldErrors?.name}
      />

      <TextField
        label="Website URL"
        name="url"
        type="url"
        required
        maxLength={ENVIRONMENT_URL_MAX}
        placeholder="https://staging.example.com"
        hint="The website address for this environment. Only http:// and https:// addresses are accepted."
        value={url}
        onChange={(value) => {
          setUrl(value);
          clearLocalError("url");
        }}
        error={localErrors.url ?? fieldErrors?.url}
      />

      <div className="space-y-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {mode === "create" ? "Add environment" : "Save changes"}
        </SubmitButton>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
