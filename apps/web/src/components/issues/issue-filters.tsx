"use client";

import { SelectField } from "@/components/ui/select-field";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  type IssueCounts,
  type IssueFilters as Filters,
  type IssuePriority,
  type IssueType,
} from "@/lib/issues/api";
import type { AssigneeOption } from "@/lib/issues/issue-loading";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
} from "@/lib/issues/labels";

const ANY = "";

/**
 * Status tabs plus priority, type and assignee filters.
 *
 * Presentational: every change is reported as a whole new filter set. Counts
 * are absent while the first page loads, so tabs never show a made-up zero.
 */
export function IssueFilters({
  filters,
  counts,
  assignees,
  onChange,
}: {
  filters: Filters;
  counts: IssueCounts | null;
  /** Null when the members could not be read: only "me" and "none" remain. */
  assignees: readonly AssigneeOption[] | null;
  onChange: (filters: Filters) => void;
}) {
  const total = counts
    ? ISSUE_STATUSES.reduce((sum, status) => sum + counts[status], 0)
    : null;

  const tabs = [
    { value: null, label: "All", count: total },
    ...ISSUE_STATUSES.map((status) => ({
      value: status,
      label: ISSUE_STATUS_LABELS[status],
      count: counts ? counts[status] : null,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Wraps instead of scrolling sideways on narrow screens. */}
      <div className="flex flex-wrap gap-2" aria-label="Filter by status" role="group">
        {tabs.map((tab) => {
          const active = filters.status === tab.value;

          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, status: tab.value })}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border-strong bg-surface-raised text-foreground hover:bg-surface-muted",
              ].join(" ")}
            >
              {tab.label}
              {tab.count !== null ? (
                <span className={active ? "opacity-90" : "text-muted-foreground"}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          label="Priority"
          name="priority"
          value={filters.priority ?? ANY}
          onChange={(value) =>
            onChange({ ...filters, priority: (value || null) as IssuePriority | null })
          }
          options={[
            { value: ANY, label: "Any priority" },
            ...ISSUE_PRIORITIES.map((value) => ({
              value,
              label: ISSUE_PRIORITY_LABELS[value],
            })),
          ]}
        />

        <SelectField
          label="Type"
          name="type"
          value={filters.type ?? ANY}
          onChange={(value) =>
            onChange({ ...filters, type: (value || null) as IssueType | null })
          }
          options={[
            { value: ANY, label: "Any type" },
            ...ISSUE_TYPES.map((value) => ({ value, label: ISSUE_TYPE_LABELS[value] })),
          ]}
        />

        <SelectField
          label="Assignee"
          name="assignee"
          value={filters.assignee ?? ANY}
          onChange={(value) => onChange({ ...filters, assignee: value || null })}
          options={[
            { value: ANY, label: "Anyone" },
            { value: "me", label: "Assigned to me" },
            { value: "none", label: "Unassigned" },
            ...(assignees ?? []).map((option) => ({
              value: option.id,
              label: option.label,
            })),
          ]}
        />
      </div>
    </div>
  );
}
