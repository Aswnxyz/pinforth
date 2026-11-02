"use client";

import { useId, type ReactNode } from "react";

export type TextFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | "url";
  hint?: string;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  /** Rendered inside the field, on the trailing edge. */
  trailing?: ReactNode;
};

export function TextField({
  label,
  name,
  value,
  onChange,
  type = "text",
  hint,
  error,
  autoComplete,
  placeholder,
  disabled,
  required,
  maxLength,
  trailing,
}: TextFieldProps) {
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

      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
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
            trailing ? "pr-11" : "",
          ].join(" ")}
        />

        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">
            {trailing}
          </div>
        ) : null}
      </div>

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
