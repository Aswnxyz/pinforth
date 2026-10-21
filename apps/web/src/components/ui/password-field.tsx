"use client";

import { useState } from "react";
import { TextField, type TextFieldProps } from "./text-field";

type PasswordFieldProps = Omit<TextFieldProps, "type" | "trailing">;

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          // Keep the caret in the field so clicking the toggle does not interrupt typing.
          onMouseDown={(event) => event.preventDefault()}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {visible ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4 fill-current"
            >
              <path d="M10 4.5c-3.6 0-6.7 2.4-8 5.5 1.3 3.1 4.4 5.5 8 5.5s6.7-2.4 8-5.5c-1.3-3.1-4.4-5.5-8-5.5Zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-1.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" />
              <path d="M3.3 2.4 17.6 16.7l-1 1L2.3 3.4l1-1Z" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4 fill-current"
            >
              <path d="M10 4.5c-3.6 0-6.7 2.4-8 5.5 1.3 3.1 4.4 5.5 8 5.5s6.7-2.4 8-5.5c-1.3-3.1-4.4-5.5-8-5.5Zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-1.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" />
            </svg>
          )}
        </button>
      }
    />
  );
}
