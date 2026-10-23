"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { OrganizationRoleBadge } from "@/components/workspace/organization-role-badge";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";

/**
 * The workspace identity in the application header.
 *
 * With one organization there is nothing to choose, so the identity is shown
 * as a plain label. With several, it becomes a disclosure that lists the
 * organizations the signed-in user belongs to, with the current one marked.
 */
export function OrganizationSwitcher({
  current,
}: {
  current: OrganizationSummary;
}) {
  const { organizations } = useWorkspaces();
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const listId = useId();

  const hasChoices = organizations.length > 1;

  // Close when the pointer goes somewhere else.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Move focus into the list when it opens, starting at the current
  // organization.
  useEffect(() => {
    if (!open) return;

    const index = organizations.findIndex(
      (organization) => organization.slug === current.slug,
    );

    const target = itemRefs.current[index >= 0 ? index : 0];
    target?.focus();
  }, [open, current.slug, organizations]);

  if (!hasChoices) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-foreground">
          {current.name}
        </span>
        <OrganizationRoleBadge role={current.role} />
      </span>
    );
  }

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleContainerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  }

  function handleItemKeyDown(
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) {
    const count = organizations.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      itemRefs.current[(index + 1) % count]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      itemRefs.current[(index - 1 + count) % count]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[count - 1]?.focus();
    }
  }

  function handleFocusOut(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0"
      onKeyDown={handleContainerKeyDown}
      onBlur={handleFocusOut}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-left shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-auto"
      >
        <span className="truncate text-sm font-semibold text-foreground">
          {current.name}
        </span>
        <OrganizationRoleBadge role={current.role} />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3.5 shrink-0 fill-current text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M8 10.5a.75.75 0 0 1-.53-.22L3.97 6.78a.75.75 0 1 1 1.06-1.06L8 8.69l2.97-2.97a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-.53.22Z" />
        </svg>
      </button>

      <ul
        id={listId}
        hidden={!open}
        className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
      >
        {organizations.map((organization, index) => {
          const isCurrent = organization.slug === current.slug;

          return (
            <li key={organization.id}>
              <Link
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                href={`/w/${organization.slug}`}
                aria-current={isCurrent ? "page" : undefined}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  isCurrent ? "bg-surface-highlight" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {organization.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    /w/{organization.slug}
                  </span>
                </span>
                <OrganizationRoleBadge role={organization.role} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
