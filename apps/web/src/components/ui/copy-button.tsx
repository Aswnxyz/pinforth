"use client";

import { useState } from "react";

/**
 * Copies `text` to the clipboard. Clipboard access can be refused (an
 * insecure origin, a browser setting), so `onBlocked` lets the caller select
 * the text for a manual copy, and the status line says so.
 */
export function CopyButton({
  text,
  label = "Copy",
  describedItem,
  onBlocked,
}: {
  text: string;
  label?: string;
  /** Read aloud, e.g. "the install snippet". */
  describedItem: string;
  onBlocked?: () => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "blocked">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      onBlocked?.();
      setState("blocked");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`${label} ${describedItem}`}
        className="inline-flex h-9 shrink-0 items-center rounded-md border border-border-strong bg-surface-raised px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {state === "copied" ? "Copied" : label}
      </button>
      <span role="status" className="text-xs leading-4 text-muted-foreground">
        {state === "blocked" ? "Copying was blocked. The text is selected — press Ctrl+C or ⌘C." : null}
      </span>
    </span>
  );
}
