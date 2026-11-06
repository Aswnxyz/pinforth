"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import type { GuestLinkField } from "@/lib/review-rounds/api";
import {
  EMPTY_GUEST_LINK_VALUES,
  LINK_EXPIRY_DAYS,
  REVIEWER_EMAIL_MAX,
  REVIEWER_NAME_MAX,
  validateGuestLink,
  type GuestLinkValues,
} from "@/lib/review-rounds/review-values";

type Errors = Partial<Record<GuestLinkField, string>>;

const dayLabel = (days: number) => (days === 1 ? "1 day" : `${days} days`);

/**
 * The invite-a-reviewer form. Presentational: the parent sends the POST and
 * owns `pending`, the message and the field errors.
 */
export function GuestLinkForm({
  roundName,
  onSubmit,
  onCancel,
  pending,
  errorMessage,
  fieldErrors,
  submitLabel = "Create review link",
}: {
  roundName: string;
  onSubmit: (values: GuestLinkValues) => void;
  onCancel: () => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: Errors | null;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<GuestLinkValues>(EMPTY_GUEST_LINK_VALUES);
  const [localErrors, setLocalErrors] = useState<Errors>({});
  const submitting = useRef(false);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);

  function set<K extends keyof GuestLinkValues>(field: K, value: GuestLinkValues[K]) {
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

    const errors = validateGuestLink(values);
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      focusFirstInvalid(event.currentTarget, Object.keys(errors));
      return;
    }

    submitting.current = true;
    onSubmit(values);
  }

  const errorFor = (field: GuestLinkField) => localErrors[field] ?? fieldErrors?.[field];

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Invite a reviewer</h3>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
          They don’t need a Pinforth account. Their feedback is labelled with the name you
          give here and filed under “{roundName}”.
        </p>
      </div>

      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Reviewer name"
          name="reviewerName"
          maxLength={REVIEWER_NAME_MAX}
          placeholder="Alice from Client Brand"
          hint="Optional."
          value={values.reviewerName}
          onChange={(value) => set("reviewerName", value)}
          error={errorFor("reviewerName")}
        />
        <TextField
          label="Reviewer email"
          name="reviewerEmail"
          type="email"
          maxLength={REVIEWER_EMAIL_MAX}
          placeholder="alice@clientbrand.com"
          hint="Optional. Not emailed — share the link yourself."
          value={values.reviewerEmail}
          onChange={(value) => set("reviewerEmail", value)}
          error={errorFor("reviewerEmail")}
        />
      </div>

      <SelectField
        label="Link works for"
        name="expiresInDays"
        value={String(values.expiresInDays)}
        onChange={(value) => set("expiresInDays", Number(value))}
        options={LINK_EXPIRY_DAYS.map((days) => ({ value: String(days), label: dayLabel(days) }))}
        error={errorFor("expiresInDays")}
      />

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <div className="sm:w-52">
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
