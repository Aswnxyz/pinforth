"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { SignOutButton, SignOutError } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/context";
import { NAV_SECTIONS, PRIMARY_CTA_LABEL, navActions } from "./landing-content";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const GHOST_LINK = `rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${FOCUS}`;
/**
 * The landing page header.
 *
 * A client island: it resolves the session itself and renders one of three
 * states from `navActions()` — skeleton, signed-in controls, or sign-in
 * controls — so the header never shows anonymous controls to a signed-in
 * visitor while the session resolves.
 */
export function LandingNav() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const action = navActions(
    isAuthenticated,
    isLoading,
    user?.name || user?.email,
  );
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="lp-nav relative z-40">
      <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5">
        <Link
          href="/"
          aria-label="Pinforth home"
          className={`shrink-0 rounded-md ${FOCUS}`}
        >
          <PinforthLogo variant="full" size="md" />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
          {NAV_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className={GHOST_LINK}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <AuthControls action={action} variant="header" />
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className={`inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:text-accent lg:hidden ${FOCUS}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-5 fill-none stroke-current stroke-[1.5]"
            >
              {open ? (
                <path d="M3.5 3.5l9 9m0-9l-9 9" />
              ) : (
                <path d="M2.5 4.5h11m-11 3.5h11m-11 3.5h11" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Unmounting is deferred to `hidden` so `aria-controls` always
          resolves; Escape restores focus to the menu button. */}
      <div
        id="landing-menu"
        hidden={!open}
        className="border-t border-border bg-surface-raised px-5 py-4 sm:px-8 lg:hidden"
      >
        <nav aria-label="Sections" className="flex flex-col gap-1">
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => setOpen(false)}
              className={`rounded-md px-2 py-2.5 text-base ${GHOST_LINK}`}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
          <AuthControls action={action} variant="menu" />
        </div>
      </div>

      <SignOutError />
    </header>
  );
}

/**
 * Session-dependent controls, shared by the header row and the menu.
 *
 * `header` keeps the compact primary controls at every width and defers the
 * secondary ones (Sign in, Sign out) to `sm` and above, where they fit
 * without crowding the logo; `menu` shows the full set.
 */
function AuthControls({
  action,
  variant,
}: {
  action: ReturnType<typeof navActions>;
  variant: "header" | "menu";
}) {
  const layout =
    variant === "header"
      ? // Below `lg` the menu owns every action, so the header stays logo +
        // menu button and no control is rendered twice.
        "hidden items-center gap-2 sm:gap-3 lg:flex"
      : "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3";

  if (action.kind === "loading") {
    return (
      <span
        aria-busy="true"
        className={`h-8 w-20 animate-pulse rounded-md bg-surface-muted ${layout}`}
      >
        <span className="sr-only">Checking your session</span>
      </span>
    );
  }

  if (action.kind === "authenticated") {
    return (
      <div className={layout}>
        <Link
          href={action.href}
          className={`max-w-[9rem] truncate px-2 py-1.5 sm:px-3 ${GHOST_LINK}`}
        >
          {action.label}
        </Link>
        <SignOutButton
          className={`h-9 px-3 ${variant === "header" ? "max-sm:hidden" : ""}`}
        />
      </div>
    );
  }

  return (
    <div className={layout}>
      <Link
        href="/login"
        className={`px-2 py-1.5 sm:px-3 ${variant === "header" ? "max-sm:hidden" : ""} ${GHOST_LINK}`}
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover ${FOCUS}`}
      >
        {PRIMARY_CTA_LABEL}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3.5 fill-none stroke-current stroke-2"
        >
          <path d="M2.5 8h10m0 0L8.75 4.25M12.5 8l-3.75 3.75" />
        </svg>
      </Link>
    </div>
  );
}
