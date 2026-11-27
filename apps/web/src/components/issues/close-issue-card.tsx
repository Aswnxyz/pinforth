"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import type { Issue, IssueStatus, UpdateIssueInput } from "@/lib/issues/api";
import { CLOSE_REASON_LABELS, formatIssueDate, issueReference } from "@/lib/issues/labels";
import { closedAs, prepareClose, UNVERIFIED_CLOSE_REASONS, type CloseValues } from "@/lib/issues/lifecycle";

const HINTS: Record<(typeof UNVERIFIED_CLOSE_REASONS)[number], string> = {
  WONT_FIX: "We decided not to change this.",
  DUPLICATE: "Already reported in another issue.",
  NOT_A_BUG: "It works as intended.",
  OTHER: "Explain in the note below.",
};

const button =
  "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The step between choosing Closed and saving it. An unverified issue needs a
 * reason, so "closed because it's done" never looks like "closed because we
 * gave up". Presentational: the parent sends the PATCH.
 */
export function CloseIssueCard({
  number,
  from,
  pending,
  message,
  serverErrors,
  onConfirm,
  onCancel,
}: {
  number: number;
  from: IssueStatus;
  pending: boolean;
  message: string | null;
  serverErrors: { closeReason?: string; closeNote?: string } | null;
  onConfirm: (input: UpdateIssueInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [values, setValues] = useState<CloseValues>({ reason: "", note: "" });
  const [errors, setErrors] = useState<{ closeReason?: string; closeNote?: string }>({});
  const verified = from === "VERIFIED";
  const shown = { ...serverErrors, ...errors };

  // An error is about the values it was shown for; any edit clears it.
  function edit(change: Partial<CloseValues>) {
    setValues((v) => ({ ...v, ...change }));
    setErrors({});
  }

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function submit() {
    const result = prepareClose(from, values);
    if ("errors" in result) return setErrors(result.errors);
    setErrors({});
    onConfirm(result.input);
  }

  return (
    <div role="dialog" aria-labelledby={`${id}-title`} className="space-y-4 rounded-xl border border-border-strong bg-surface-raised p-5 shadow-xs">
      <div>
        <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
          Close {issueReference(number)}?
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {verified
            ? "A teammate tested the fix and it passed, so it will be closed as resolved."
            : "This issue hasn’t been verified. Say why you’re closing it, so the history stays clear."}
        </p>
      </div>

      {verified ? null : (
        <fieldset aria-describedby={shown.closeReason ? `${id}-reason-error` : undefined}>
          <legend className="text-sm font-medium text-foreground">Why are you closing it?</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {UNVERIFIED_CLOSE_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${values.reason === reason ? "border-accent bg-accent/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={reason}
                  checked={values.reason === reason}
                  onChange={() => edit({ reason })}
                  disabled={pending}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block font-medium text-foreground">{CLOSE_REASON_LABELS[reason]}</span>
                  <span className="block text-xs text-muted-foreground">{HINTS[reason]}</span>
                </span>
              </label>
            ))}
          </div>
          {shown.closeReason ? (
            <p id={`${id}-reason-error`} className="mt-2 text-sm text-danger">
              {shown.closeReason}
            </p>
          ) : null}
        </fieldset>
      )}

      <div>
        <label htmlFor={`${id}-note`} className="text-sm font-medium text-foreground">
          Note {values.reason === "OTHER" ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
        </label>
        <textarea
          id={`${id}-note`}
          rows={3}
          value={values.note}
          disabled={pending}
          aria-invalid={shown.closeNote ? true : undefined}
          aria-describedby={shown.closeNote ? `${id}-note-error` : undefined}
          onChange={(event) => edit({ note: event.target.value })}
          className="mt-1 block w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        />
        {shown.closeNote ? (
          <p id={`${id}-note-error`} className="mt-1 text-sm text-danger">
            {shown.closeNote}
          </p>
        ) : null}
      </div>

      {message ? <FormAlert>{message}</FormAlert> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={submit} disabled={pending} aria-busy={pending} className={`${button} bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:outline-accent`}>
          {pending ? "Closing…" : "Close issue"}
        </button>
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={pending} className={`${button} border border-border-strong bg-surface-raised text-foreground hover:bg-surface-muted focus-visible:outline-accent`}>
          Keep it open
        </button>
      </div>
    </div>
  );
}

/** "Closed as Duplicate by Priya on 12 Nov 2026", with the note when there is one. */
export function IssueClosedSummary({ issue }: { issue: Issue }) {
  const as = closedAs(issue);
  if (!as) return null;
  const by = issue.closedBy?.name?.trim();
  return (
    <div className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
      <p>
        {as}
        {by ? ` by ${by}` : ""}
        {issue.closedAt ? ` on ${formatIssueDate(issue.closedAt)}` : ""}.
      </p>
      {issue.closeNote ? (
        <p className="mt-1 wrap-break-word whitespace-pre-wrap text-foreground">{issue.closeNote}</p>
      ) : null}
    </div>
  );
}
