"use client";

import { useEffect, useId, useRef } from "react";
import { COMMENT_MAX } from "@/lib/issues/timeline";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2";
const solid = `inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;

export const buttonClass = {
  primary: `${solid} bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:outline-accent`,
  secondary: `${solid} border border-border-strong bg-surface-raised text-foreground hover:bg-surface-muted focus-visible:outline-accent`,
  danger: `${solid} bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:outline-danger`,
  link: `text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${focus} focus-visible:outline-accent`,
  dangerLink: `text-xs font-medium text-danger underline-offset-4 hover:underline ${focus} focus-visible:outline-danger`,
};

/** Marks a note the client never sees. */
export function InternalBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-status-qa-pending/40 px-2 py-0.5 text-xs font-medium text-status-qa-pending-foreground">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 fill-current">
        <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2Z" />
      </svg>
      Internal<span className="sr-only">: not visible to the client</span>
    </span>
  );
}

/** Ctrl/⌘+Enter submits. Shows a counter only near the limit. */
export function CommentTextarea({
  label,
  value,
  onChange,
  onSubmit,
  disabled,
  autoFocus = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const near = value.length > COMMENT_MAX * 0.9;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={4}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={near ? `${id}-count` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="block min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      />
      {near ? (
        <p id={`${id}-count`} className="mt-1 text-right text-xs text-muted-foreground">
          {value.trim().length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
