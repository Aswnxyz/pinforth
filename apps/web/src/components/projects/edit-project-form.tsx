"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import type { UpdateProjectInput } from "@/lib/projects/api";
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  prepareProjectUpdate,
  type ProjectFieldErrors,
  type ProjectEditValues,
} from "@/lib/projects/project-edit";

/**
 * The project-editing form.
 *
 * Presentational: it never makes network requests and knows nothing about
 * ids or endpoints. `onSubmit` receives the *prepared partial update* — only
 * the fields that actually changed — so the parent can PATCH exactly that.
 * The project slug is never editable and never part of the payload.
 *
 * Values start from `initialValues` on mount only. When the parent switches
 * to a different project it remounts the form with that project's id as the
 * React key, so an in-progress edit is never overwritten by an effect.
 */
export function EditProjectForm({
  initialValues,
  onSubmit,
  pending,
  errorMessage,
  fieldErrors,
  onCancel,
}: {
  /** The project's current name and description. */
  initialValues: ProjectEditValues;
  /** Receives the partial update; empty changes are never sent. */
  onSubmit: (changes: UpdateProjectInput) => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: ProjectFieldErrors | null;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description ?? "");
  const [localErrors, setLocalErrors] = useState<ProjectFieldErrors>({});

  // Guards the window between a click and the parent's `pending` flipping, so
  // a fast second submit cannot fire before the button re-renders disabled.
  const submitting = useRef(false);

  useEffect(() => {
    // The parent finished an attempt (success or failure); accept input again.
    if (!pending) submitting.current = false;
  }, [pending]);

  function clearLocalError(field: keyof ProjectFieldErrors) {
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

    const result = prepareProjectUpdate(initialValues, { name, description });

    if (!result.ok) {
      setLocalErrors(result.errors);
      focusFirstInvalid(event.currentTarget, Object.keys(result.errors));
      return;
    }

    // Nothing was edited, so there is no PATCH to send.
    if (Object.keys(result.changes).length === 0) return;

    submitting.current = true;
    setLocalErrors({});

    onSubmit(result.changes);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <TextField
        label="Project name"
        name="name"
        required
        maxLength={PROJECT_NAME_MAX}
        value={name}
        onChange={(value) => {
          setName(value);
          clearLocalError("name");
        }}
        error={localErrors.name ?? fieldErrors?.name}
      />

      <TextArea
        label="Description"
        name="description"
        maxLength={PROJECT_DESCRIPTION_MAX}
        hint="Optional. What this project covers, in your own words."
        value={description}
        onChange={(value) => {
          setDescription(value);
          clearLocalError("description");
        }}
        error={localErrors.description ?? fieldErrors?.description}
      />

      <div className="space-y-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save changes
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
