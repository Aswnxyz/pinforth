"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import type { ReviewRoundField } from "@/lib/review-rounds/api";
import {
  ROUND_DESCRIPTION_MAX,
  ROUND_NAME_MAX,
  validateReviewRound,
  type ReviewRoundValues,
} from "@/lib/review-rounds/review-values";

type Errors = Partial<Record<ReviewRoundField, string>>;

/**
 * The create-review-round form. Presentational: the parent sends the POST
 * and owns `pending`, the message and the field errors.
 */
export function ReviewRoundForm({
  environments,
  onSubmit,
  onCancel,
  pending,
  errorMessage,
  fieldErrors,
  submitLabel = "Create review round",
}: {
  environments: readonly { id: string; name: string; url: string }[];
  onSubmit: (values: ReviewRoundValues) => void;
  onCancel: () => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: Errors | null;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<ReviewRoundValues>(() => ({
    name: "",
    // One website is the common case, so it starts chosen.
    environmentId: environments.length === 1 ? environments[0].id : "",
    description: "",
  }));
  const [localErrors, setLocalErrors] = useState<Errors>({});
  const submitting = useRef(false);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);

  function set<K extends keyof ReviewRoundValues>(field: K, value: ReviewRoundValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
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

    const errors = validateReviewRound(values);
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      focusFirstInvalid(event.currentTarget, Object.keys(errors));
      return;
    }

    submitting.current = true;
    onSubmit(values);
  }

  const errorFor = (field: ReviewRoundField) => localErrors[field] ?? fieldErrors?.[field];

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-border bg-surface-raised p-5 shadow-xs sm:p-6"
    >
      <h2 className="text-base font-semibold text-foreground">New review round</h2>

      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <TextField
        label="Name"
        name="name"
        required
        maxLength={ROUND_NAME_MAX}
        placeholder="Sprint 14 client review"
        value={values.name}
        onChange={(value) => set("name", value)}
        error={errorFor("name")}
      />

      <SelectField
        label="Website to review"
        name="environmentId"
        value={values.environmentId}
        onChange={(value) => set("environmentId", value)}
        options={[
          ...(environments.length === 1 ? [] : [{ value: "", label: "Choose an environment" }]),
          ...environments.map((environment) => ({
            value: environment.id,
            label: `${environment.name} — ${environment.url}`,
          })),
        ]}
        hint="Reviewers are sent here, and the feedback widget only accepts reports from this address."
        error={errorFor("environmentId")}
      />

      <TextArea
        label="Instructions for reviewers"
        name="description"
        maxLength={ROUND_DESCRIPTION_MAX}
        rows={4}
        placeholder="Please check the new checkout and the mobile menu."
        hint="Optional."
        value={values.description}
        onChange={(value) => set("description", value)}
        error={errorFor("description")}
      />

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <div className="sm:w-56">
          <SubmitButton pending={pending} pendingLabel="Creating…">
            {submitLabel}
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
