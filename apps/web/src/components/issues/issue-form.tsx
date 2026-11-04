"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  type IssueFieldErrors,
  type IssuePriority,
  type IssueType,
} from "@/lib/issues/api";
import type { AssigneeOption } from "@/lib/issues/issue-loading";
import {
  DESCRIPTION_MAX,
  EMPTY_ISSUE_VALUES,
  TITLE_MAX,
  validateIssueValues,
  type IssueFormValues,
} from "@/lib/issues/issue-values";
import { ISSUE_PRIORITY_LABELS, ISSUE_TYPE_LABELS } from "@/lib/issues/labels";

/**
 * The create-issue form.
 *
 * Presentational and submission-agnostic: the parent owns the request and
 * controls `pending`, `errorMessage` and `fieldErrors`. Values are held here
 * and survive a failed submission.
 */
export function IssueForm({
  assignees,
  environments,
  onSubmit,
  pending,
  errorMessage,
  fieldErrors,
  submitLabel = "Create issue",
  cancelHref,
}: {
  /** Null when the members could not be read; the issue starts unassigned. */
  assignees: readonly AssigneeOption[] | null;
  environments: readonly { id: string; name: string }[];
  onSubmit: (values: IssueFormValues) => void;
  pending: boolean;
  errorMessage?: string | null;
  fieldErrors?: IssueFieldErrors | null;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [values, setValues] = useState<IssueFormValues>(EMPTY_ISSUE_VALUES);
  const [localErrors, setLocalErrors] = useState<IssueFieldErrors>({});

  // Guards the window between a click and the parent's `pending` flipping.
  const submitting = useRef(false);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending]);

  function set<K extends keyof IssueFormValues>(field: K, value: IssueFormValues[K]) {
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

    const errors = validateIssueValues(values);
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      focusFirstInvalid(event.currentTarget, Object.keys(errors));
      return;
    }

    submitting.current = true;
    setLocalErrors({});
    onSubmit(values);
  }

  const errorFor = (field: keyof IssueFieldErrors) =>
    localErrors[field] ?? fieldErrors?.[field];

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}

      <TextField
        label="Title"
        name="title"
        required
        maxLength={TITLE_MAX}
        placeholder="Contact button does nothing on mobile"
        hint="A short summary of the problem or request."
        value={values.title}
        onChange={(value) => set("title", value)}
        error={errorFor("title")}
      />

      <TextArea
        label="Description"
        name="description"
        maxLength={DESCRIPTION_MAX}
        rows={6}
        placeholder="What happened, where, and what you expected instead."
        hint="Optional. Steps to reproduce help the developer most."
        value={values.description}
        onChange={(value) => set("description", value)}
        error={errorFor("description")}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          label="Type"
          name="type"
          value={values.type}
          onChange={(value) => set("type", value as IssueType)}
          options={ISSUE_TYPES.map((value) => ({ value, label: ISSUE_TYPE_LABELS[value] }))}
          error={errorFor("type")}
        />

        <SelectField
          label="Priority"
          name="priority"
          value={values.priority}
          onChange={(value) => set("priority", value as IssuePriority)}
          options={ISSUE_PRIORITIES.map((value) => ({
            value,
            label: ISSUE_PRIORITY_LABELS[value],
          }))}
          error={errorFor("priority")}
        />

        {assignees ? (
          <SelectField
            label="Assignee"
            name="assigneeId"
            value={values.assigneeId}
            onChange={(value) => set("assigneeId", value)}
            options={[
              { value: "", label: "Unassigned" },
              ...assignees.map((option) => ({ value: option.id, label: option.label })),
            ]}
            error={errorFor("assigneeId")}
          />
        ) : null}

        <SelectField
          label="Environment"
          name="environmentId"
          value={values.environmentId}
          onChange={(value) => set("environmentId", value)}
          options={[
            { value: "", label: "Not specified" },
            ...environments.map((environment) => ({
              value: environment.id,
              label: environment.name,
            })),
          ]}
          hint={environments.length === 0 ? "This project has no environments yet." : undefined}
          error={errorFor("environmentId")}
        />
      </div>

      {!assignees ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Team members couldn’t be loaded, so this issue will start unassigned. You can assign
          it afterwards.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <div className="sm:w-48">
          <SubmitButton pending={pending} pendingLabel="Creating…">
            {submitLabel}
          </SubmitButton>
        </div>
        <Link
          href={cancelHref}
          className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-32"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
