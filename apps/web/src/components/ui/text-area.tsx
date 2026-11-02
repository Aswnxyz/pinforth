"use client";

import { useId } from "react";

export type TextAreaProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  rows?: number;
};

/**
 * A labelled, multi-line text input.
 *
 * Mirrors `TextField`'s labelling and error wiring so single-line and
 * multi-line fields behave the same for assistive technology. Added because
 * the project description needs a textarea and there isn't one yet.
 */
export function TextArea({
  label,
  name,
  value,
  onChange,
  hint,
  error,
  placeholder,
  disabled,
  required,
  maxLength,
  rows = 4,
}: TextAreaProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </label>

      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "block w-full rounded-md border bg-surface-raised px-3 py-2.5 text-sm text-foreground shadow-xs transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-danger focus-visible:outline-danger"
            : "border-border-strong focus-visible:outline-accent",
        ].join(" ")}
      />

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
