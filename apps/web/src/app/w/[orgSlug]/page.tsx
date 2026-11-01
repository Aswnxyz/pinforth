"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { MembersEntry } from "@/components/workspace/members-entry";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import { ORGANIZATION_ROLE_LABELS } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import {
  canManageProjects,
  resolveOrganizationAccess,
} from "@/lib/organizations/organization-access";

export default function WorkspacePage() {
  return (
    <WorkspaceGate>
      {/* The slug is only known at request time, so it is read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceView />
      </Suspense>
    </WorkspaceGate>
  );
}

function WorkspaceView() {
  const params = useParams<{ orgSlug: string }>();
  const { organizations } = useWorkspaces();

  const access = resolveOrganizationAccess(organizations, params.orgSlug);

  if (access.kind === "unavailable") {
    return <UnavailableWorkspace />;
  }

  const { organization } = access;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader organization={organization} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {organization.name}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              The client websites you review, the issues you fix and the
              releases you approve for this workspace.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Workspace name
              </dt>
              <dd className="mt-1 truncate text-sm font-medium text-foreground">
                {organization.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Slug
              </dt>
              <dd className="mt-1 font-mono text-sm break-all text-foreground">
                {organization.slug}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your role
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {ORGANIZATION_ROLE_LABELS[organization.role]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Workspace created
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {new Date(organization.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>

          {/* Project management entry: links only. The Projects route owns
              fetching, so the workspace homepage never duplicates its
              requests just to display a count. */}
          <section
            aria-labelledby="project-management-heading"
            className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Projects
            </p>
            <h2
              id="project-management-heading"
              className="mt-1 text-base font-semibold text-foreground"
            >
              Manage this workspace&apos;s projects
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              The client websites this workspace reviews — with their
              environments, feedback, issues and releases — are all in Projects.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/w/${organization.slug}/projects`}
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                View projects
              </Link>
              {canManageProjects(organization.role) ? (
                <Link
                  href={`/w/${organization.slug}/projects/new`}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Create project
                </Link>
              ) : null}
            </div>
          </section>

          {/* Members entry, right below Projects: every role can look at who
              has access; the route itself gates what each person may change. */}
          <MembersEntry slug={organization.slug} />

          <WorkspaceEmptyState />
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

function UnavailableWorkspace() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader />

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Workspace not available
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            This workspace is not available. The link may be out of date, or you
            may not have access to it.
          </p>

          <Link
            href="/w"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to your workspaces
          </Link>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
