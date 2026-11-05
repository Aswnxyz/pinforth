"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import type { IssueFieldErrors } from "@/lib/issues/api";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  validateDescription,
  validateTitle,
} from "@/lib/issues/issue-values";

/**
 * The inline title and description editor.
 *
 * Prefilled from the issue the parent passes, and remounted by the parent
 * per editing session, so it never shows an earlier session's typing.
 */
export function IssueTextEditor({
  initialTitle,
  initialDescription,
  onSubmit,
  onCancel,
  pending,
  fieldErrors,
}: {
  initialTitle: string;
  initialDescription: string;
  onSubmit: (values: { title: string; description: string }) => void;
  onCancel: () => void;
  pending: boolean;
  fieldErrors: IssueFieldErrors | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [localErrors, setLocalErrors] = useState<IssueFieldErrors>({});
  const submitting = useRef(false);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);

  function clearLocalError(field: keyof IssueFieldErrors) {
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

    const errors: IssueFieldErrors = {};
    const titleError = validateTitle(title);
    const descriptionError = validateDescription(description);
    if (titleError) errors.title = titleError;
    if (descriptionError) errors.description = descriptionError;

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      focusFirstInvalid(event.currentTarget, Object.keys(errors));
      return;
    }

    submitting.current = true;
    setLocalErrors({});
    onSubmit({ title, description });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
    >
      <TextField
        label="Title"
        name="title"
        required
        maxLength={TITLE_MAX}
        value={title}
        onChange={(value) => {
          setTitle(value);
          clearLocalError("title");
        }}
        error={localErrors.title ?? fieldErrors?.title}
      />

      <TextArea
        label="Description"
        name="description"
        maxLength={DESCRIPTION_MAX}
        rows={8}
        hint="Leave empty to remove the description."
        value={description}
        onChange={(value) => {
          setDescription(value);
          clearLocalError("description");
        }}
        error={localErrors.description ?? fieldErrors?.description}
      />

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <div className="sm:w-40">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-32"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
