"use client";

import { SelectField, type SelectOption } from "@/components/ui/select-field";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  type Issue,
  type IssueFieldErrors,
  type UpdateIssueInput,
} from "@/lib/issues/api";
import type { AssigneeOption } from "@/lib/issues/issue-loading";
import {
  formatIssueDate,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  personName,
} from "@/lib/issues/labels";

const NONE = "";

/**
 * Keeps the current value selectable even when it is no longer offered (an
 * assignee who left, a renamed environment), so the select never silently
 * shows a different value than the issue has.
 */
function withCurrent(
  options: SelectOption[],
  current: { id: string; label: string } | null,
): SelectOption[] {
  if (!current || options.some((option) => option.value === current.id)) return options;
  return [...options, { value: current.id, label: current.label }];
}

/**
 * The issue's editable fields. Each select saves on change through
 * `onSave`, with exactly one field in the update; the parent owns the request.
 */
export function IssueFieldsPanel({
  issue,
  assignees,
  environments,
  disabled,
  fieldErrors,
  onSave,
}: {
  issue: Issue;
  /** Null when the members could not be read: the assignee is read-only. */
  assignees: readonly AssigneeOption[] | null;
  environments: readonly { id: string; name: string }[];
  /** True while any change is being saved or must be checked first. */
  disabled: boolean;
  fieldErrors: IssueFieldErrors | null;
  onSave: (changes: UpdateIssueInput) => void;
}) {
  return (
    <aside className="space-y-4 rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
      <SelectField
        label="Status"
        name="status"
        value={issue.status}
        disabled={disabled}
        error={fieldErrors?.status}
        onChange={(value) => onSave({ status: value as Issue["status"] })}
        options={ISSUE_STATUSES.map((value) => ({ value, label: ISSUE_STATUS_LABELS[value] }))}
      />

      <SelectField
        label="Priority"
        name="priority"
        value={issue.priority}
        disabled={disabled}
        error={fieldErrors?.priority}
        onChange={(value) => onSave({ priority: value as Issue["priority"] })}
        options={ISSUE_PRIORITIES.map((value) => ({
          value,
          label: ISSUE_PRIORITY_LABELS[value],
        }))}
      />

      <SelectField
        label="Type"
        name="type"
        value={issue.type}
        disabled={disabled}
        error={fieldErrors?.type}
        onChange={(value) => onSave({ type: value as Issue["type"] })}
        options={ISSUE_TYPES.map((value) => ({ value, label: ISSUE_TYPE_LABELS[value] }))}
      />

      {assignees ? (
        <SelectField
          label="Assignee"
          name="assigneeId"
          value={issue.assignee?.id ?? NONE}
          disabled={disabled}
          error={fieldErrors?.assigneeId}
          onChange={(value) => onSave({ assigneeId: value || null })}
          options={withCurrent(
            [
              { value: NONE, label: "Unassigned" },
              ...assignees.map((option) => ({ value: option.id, label: option.label })),
            ],
            issue.assignee && { id: issue.assignee.id, label: personName(issue.assignee) },
          )}
        />
      ) : (
        <ReadOnlyField
          label="Assignee"
          value={issue.assignee ? personName(issue.assignee) : "Unassigned"}
        />
      )}

      <SelectField
        label="Environment"
        name="environmentId"
        value={issue.environment?.id ?? NONE}
        disabled={disabled}
        error={fieldErrors?.environmentId}
        onChange={(value) => onSave({ environmentId: value || null })}
        options={withCurrent(
          [
            { value: NONE, label: "Not specified" },
            ...environments.map((environment) => ({
              value: environment.id,
              label: environment.name,
            })),
          ],
          issue.environment && { id: issue.environment.id, label: issue.environment.name },
        )}
      />

      <dl className="space-y-3 border-t border-border pt-4">
        <ReadOnlyField
          label="Reported by"
          value={issue.reporter ? personName(issue.reporter) : "Guest reviewer"}
        />
        <ReadOnlyField label="Opened" value={formatIssueDate(issue.createdAt)} />
        <ReadOnlyField label="Last updated" value={formatIssueDate(issue.updatedAt)} />
        <ReadOnlyField
          label="Source"
          value={issue.source === "WIDGET" ? "Feedback widget" : "Dashboard"}
        />
      </dl>
    </aside>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}
