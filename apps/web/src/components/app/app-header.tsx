"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { SignOutButton, SignOutError } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/workspace/organization-switcher";
import type { OrganizationSummary } from "@/lib/organizations/api";

/**
 * The application header.
 *
 * It carries the brand, the workspace identity, and the account actions. The
 * workspace identity is optional: pages that are not inside a workspace, such
 * as the account page, leave it out.
 */
export function AppHeader({
  organization,
  children,
}: {
  /** The workspace the user is currently in, when there is one. */
  organization?: OrganizationSummary;
  /** Extra navigation, shown before the account actions. */
  children?: ReactNode;
}) {
  const pathname = usePathname();
  // The account link is marked as the current destination rather than
  // silently pointing at the page it is already on.
  const isCurrentAccount = pathname === "/account";

  return (
    <header className="border-b border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-8 sm:py-5">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <PinforthLogo variant="full" size="md" />
        </Link>

        {organization ? (
          <div className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto">
            <OrganizationSwitcher current={organization} />
            <CreateWorkspaceLink />
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          {children}

          <Link
            href="/account"
            aria-current={isCurrentAccount ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9 ${
              isCurrentAccount
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-4 shrink-0 fill-current sm:hidden"
            >
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.42 0-4.5 1.24-4.5 2.75 0 .69.63 1.25 1.5 1.25h6c.87 0 1.5-.56 1.5-1.25 0-1.51-2.08-2.75-4.5-2.75Z" />
            </svg>
            <span className="sr-only sm:not-sr-only">Account</span>
          </Link>

          <SignOutButton className="h-10 px-3 sm:h-9" />
        </div>
      </div>

      <SignOutError />
    </header>
  );
}

/**
 * The way to a second workspace.
 *
 * It lives in the header so creating another workspace stays reachable once
 * the first one exists.
 */
function CreateWorkspaceLink() {
  return (
    <Link
      href="/onboarding"
      title="Create another workspace"
      className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-4 shrink-0 fill-current"
      >
        <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
      </svg>
      <span className="hidden sm:inline">Create another workspace</span>
      <span className="sr-only sm:hidden">Create another workspace</span>
    </Link>
  );
}
