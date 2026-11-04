"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { FormAlert } from "@/components/ui/form-alert";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import { resolveOrganizationAccess } from "@/lib/organizations/organization-access";
import type { LoadState } from "@/lib/issues/issue-loading";

type IssueRouteParams = { orgSlug: string; projectSlug: string; number?: string };

/**
 * The frame every issue route shares: the signed-in gate, the header and the
 * workspace resolved from the URL. `children` receives the workspace and the
 * route params; the URL slug itself is never trusted.
 */
export function IssuePageShell({
  children,
}: {
  children: (organization: OrganizationSummary, params: IssueRouteParams) => ReactNode;
}) {
  return (
    <WorkspaceGate>
      {/* The slugs are only known at request time, so they are read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <ShellView>{children}</ShellView>
      </Suspense>
    </WorkspaceGate>
  );
}

function ShellView({
  children,
}: {
  children: (organization: OrganizationSummary, params: IssueRouteParams) => ReactNode;
}) {
  const params = useParams<IssueRouteParams>();
  const { organizations } = useWorkspaces();
  const access = resolveOrganizationAccess(organizations, params.orgSlug);
  const organization = access.kind === "available" ? access.organization : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader organization={organization} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-4xl">
          {organization ? (
            children(organization, params)
          ) : (
            <StatePanel
              title="Workspace not available"
              body="This workspace is not available. The link may be out of date, or you may not have access to it."
              backHref="/w"
              backLabel="Back to your workspaces"
            />
          )}
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
        <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.81 8l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
      </svg>
      {children}
    </Link>
  );
}

/** A loading line for part of a screen, where the full-page loader is too much. */
export function InlineLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      {label}
    </div>
  );
}

function StatePanel({
  title,
  body,
  message,
  backHref,
  backLabel,
  onRetry,
}: {
  title: string;
  body?: string;
  message?: string;
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <BackLink href={backHref}>{backLabel}</BackLink>

      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {body ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
        ) : null}
        {message ? (
          <div className="mt-4">
            <FormAlert>{message}</FormAlert>
          </div>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders every non-ready load state the same way on each issue screen.
 * Returns null for `ready`, so the caller renders its content. `login` shows
 * the loading state: the page is already redirecting.
 */
export function LoadStateView({
  state,
  what,
  backHref,
  backLabel,
  onRetry,
}: {
  state: LoadState<unknown>;
  /** "project" or "issue", used in the titles. */
  what: string;
  backHref: string;
  backLabel: string;
  onRetry: () => void;
}) {
  switch (state.kind) {
    case "ready":
      return null;
    case "loading":
    case "login":
      return <WorkspaceLoading />;
    case "not-found":
      // Missing and inaccessible share this state: the screen must not
      // reveal whether it exists.
      return (
        <StatePanel
          title={`This ${what} is not available`}
          body="The link may be out of date, or you may not have access to it."
          backHref={backHref}
          backLabel={backLabel}
        />
      );
    case "forbidden":
      return (
        <StatePanel
          title={`You don’t have access to this ${what}`}
          message={state.message}
          backHref={backHref}
          backLabel={backLabel}
        />
      );
    case "unavailable":
      return (
        <StatePanel
          title={`We couldn’t load this ${what}`}
          body="This is usually temporary."
          message={state.message}
          backHref={backHref}
          backLabel={backLabel}
          onRetry={onRetry}
        />
      );
  }
}
