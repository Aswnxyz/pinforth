"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import { projectSlugPreview } from "@/lib/projects/preview";

/** The name a project was given, before any submission. */
const NAME_MIN = 2;
const NAME_MAX = 180;
const DESCRIPTION_MAX = 2000;

/**
 * The values this form collects. Matches the agreed create-project contract
 * (`{ name, description? }`) without duplicating a shared response type.
 */
export interface CreateProjectValues {
  name: string;
  /** Omitted when empty — the backend treats it as "no description". */
  description?: string;
}

/** The fields the form can show a server-side error against. */
export type CreateProjectFieldErrors = Partial<
  Record<"name" | "description", string>
>;

/**
 * The project-creation form.
 *
 * Presentational and submission-agnostic: it never makes network requests.
 * The parent passes an `onSubmit` callback that eventually wraps the project
 * API, and controls `pending`, `errorMessage` and `fieldErrors`. Form values
 * are held here and kept through a failed submission.
 */
export function CreateProjectForm({
  orgSlug,
  onSubmit,
  pending,
  errorMessage,
  fieldErrors,
}: {
  orgSlug: string;
  onSubmit: (values: CreateProjectValues) => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: CreateProjectFieldErrors | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [localErrors, setLocalErrors] = useState<CreateProjectFieldErrors>({});

  // Guards the window between a click and the parent's `pending` flipping, so
  // a fast second submit cannot fire before the button re-renders disabled.
  const submitting = useRef(false);

  useEffect(() => {
    // The parent finished an attempt (success or failure); accept input again.
    if (!pending) submitting.current = false;
  }, [pending]);

  const preview = projectSlugPreview(name);

  function clearLocalError(field: keyof CreateProjectFieldErrors) {
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

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const errors: CreateProjectFieldErrors = {};

    if (trimmedName.length < NAME_MIN) {
      errors.name = `Project name must be at least ${NAME_MIN} characters.`;
    } else if (trimmedName.length > NAME_MAX) {
      errors.name = `Project name must be at most ${NAME_MAX} characters.`;
    }

    if (trimmedDescription.length > DESCRIPTION_MAX) {
      errors.description = `Description must be at most ${DESCRIPTION_MAX.toLocaleString()} characters.`;
    }

    // A name of the right length can still produce no usable URL (e.g. "AB"
    // or "!!!"). Reserved names are fine — the backend generates a slug.
    if (trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX) {
      if (projectSlugPreview(trimmedName).kind === "none") {
        errors.name =
          "This name can’t become a project URL. Use at least 3 letters or " +
          "numbers, for example “Coffee Shop Website”.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      focusFirstInvalid(event.currentTarget, Object.keys(errors));
      return;
    }

    submitting.current = true;
    setLocalErrors({});

    onSubmit({
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <TextField
        label="Project name"
        name="name"
        required
        maxLength={NAME_MAX}
        placeholder="Restaurant Website Redesign"
        hint="The client website this project covers."
        value={name}
        onChange={(value) => {
          setName(value);
          clearLocalError("name");
        }}
        error={localErrors.name ?? fieldErrors?.name}
      />

      {preview.kind !== "none" ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project URL preview
          </p>
          {preview.kind === "slug" ? (
            <p className="mt-1 font-mono text-sm break-all text-foreground">
              /w/{orgSlug}/projects/{preview.slug}
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This name matches a reserved Pinforth address, so a project URL
              will be generated for it when the project is created.
            </p>
          )}
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            This is only a preview. The final URL is chosen when the project is
            created.
          </p>
        </div>
      ) : null}

      <TextArea
        label="Description"
        name="description"
        maxLength={DESCRIPTION_MAX}
        placeholder="Website redesign for our client"
        hint="Optional. What this project covers, in your own words."
        value={description}
        onChange={(value) => {
          setDescription(value);
          clearLocalError("description");
        }}
        error={localErrors.description ?? fieldErrors?.description}
      />

      <div className="space-y-2">
        <SubmitButton pending={pending} pendingLabel="Creating project…">
          Create project
        </SubmitButton>

        <Link
          href={`/w/${orgSlug}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
