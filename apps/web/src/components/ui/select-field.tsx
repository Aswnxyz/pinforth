"use client";

import { useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export type SelectFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Hides the label visually; it is still read by assistive technology. */
  hideLabel?: boolean;
};

/**
 * A labelled native select.
 *
 * Mirrors `TextField`'s labelling and error wiring. Native on purpose: it is
 * keyboard- and screen-reader-friendly on every platform for free.
 */
export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
  hideLabel = false,
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={
          hideLabel ? "sr-only" : "block text-sm font-medium text-foreground"
        }
      >
        {label}
      </label>

      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "block h-11 w-full rounded-md border bg-surface-raised px-3 text-sm text-foreground shadow-xs transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-danger focus-visible:outline-danger"
            : "border-border-strong focus-visible:outline-accent",
        ].join(" ")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-xs font-medium leading-5 text-danger"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="mt-0.5 size-3.5 shrink-0 fill-current"
          >
            <path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 3.4a.8.8 0 0 0-.8.8v3.2a.8.8 0 0 0 1.6 0v-3.2a.8.8 0 0 0-.8-.8Zm0 6.3a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" />
          </svg>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
