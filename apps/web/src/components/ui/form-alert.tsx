import type { ReactNode } from "react";

/**
 * Form-level message. Used for anything the fields cannot explain on their own:
 * a refused sign-in, a service that is unreachable, or a configuration gap.
 */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="mt-0.5 size-4 shrink-0 fill-current"
      >
        <path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 3.4a.8.8 0 0 0-.8.8v3.2a.8.8 0 0 0 1.6 0v-3.2a.8.8 0 0 0-.8-.8Zm0 6.3a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" />
      </svg>
      <p className="leading-6">{children}</p>
    </div>
  );
}
