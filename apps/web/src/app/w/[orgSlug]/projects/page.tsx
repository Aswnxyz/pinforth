"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { ProjectList } from "@/components/projects/project-list";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import {
  canManageProjects,
  resolveOrganizationAccess,
} from "@/lib/organizations/organization-access";
import {
  createRequestGuard,
} from "@/lib/projects/project-detail";
import {
  loadProjectList,
  type ProjectListState,
} from "@/lib/projects/project-list";

export default function ProjectsPage() {
  return (
    <WorkspaceGate>
      {/* The slug is only known at request time, so it is read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <ProjectsView />
      </Suspense>
    </WorkspaceGate>
  );
}

function ProjectsView() {
  const params = useParams<{ orgSlug: string }>();
  const { organizations } = useWorkspaces();

  // The URL slug is never trusted: the workspace must be one the signed-in
  // user can actually reach, or the state is "unavailable".
  const access = resolveOrganizationAccess(organizations, params.orgSlug);

  if (access.kind === "unavailable") {
    return <UnavailableWorkspace />;
  }

  const { organization } = access;
  const canCreate = canManageProjects(organization.role);

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader organization={organization} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Link
            href={`/w/${organization.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
              <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.81 8l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
            Back to {organization.name}
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {organization.name} · Projects
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Projects
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                The client websites this workspace reviews, and the feedback,
                issues and releases that belong to them.
              </p>
            </div>

            {canCreate ? (
              <Link
                href={`/w/${organization.slug}/projects/new`}
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Create project
              </Link>
            ) : null}
          </div>

          {/* Keyed by id so a different workspace always starts from a fresh
              load — project data from one organization is never carried over
              into another. */}
          <ProjectListSection
            key={organization.id}
            organization={organization}
            canCreate={canCreate}
          />
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

/**
 * The project list plus the state of the in-flight request.
 *
 * The request addresses the organization by its backend id (never the URL
 * slug), and `loadProjectList` never throws — every failure arrives as a
 * typed outcome. A response from a superseded request is dropped by the
 * guard, so switching workspaces or retrying can never show stale data.
 */
function ProjectListSection({
  organization,
  canCreate,
}: {
  organization: OrganizationSummary;
  canCreate: boolean;
}) {
  const router = useRouter();

  const [retryToken, setRetryToken] = useState(0);

  // Identifies the request this render belongs to. When it changes (another
  // organization, a retry) the derived state below is loading again, so data
  // fetched under one workspace is never rendered under another.
  const requestKey = `${organization.id}|${retryToken}`;

  const [result, setResult] = useState<{
    key: string;
    state: ProjectListState;
  } | null>(null);

  const guard = useRef(createRequestGuard());

  useEffect(() => {
    const token = guard.current.start();

    loadProjectList(organization.id).then((state) => {
      // A newer request has started; this result belongs to the past.
      if (guard.current.accept(token)) {
        setResult({ key: requestKey, state });
      }
    });
  }, [organization.id, requestKey]);

  const state: ProjectListState =
    result && result.key === requestKey ? result.state : { kind: "loading" };

  useEffect(() => {
    // The session was confirmed invalid by the API's refresh flow.
    if (state.kind === "login") {
      router.replace("/login");
    }
  }, [state.kind, router]);

  if (state.kind === "loading" || state.kind === "login") {
    return <WorkspaceLoading />;
  }

  if (state.kind === "not-found") {
    // Missing and inaccessible share this exact state, on purpose: the
    // response must not reveal whether a workspace exists.
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Workspace not available
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          This workspace is not available. The link may be out of date, or
          you may not have access to it.
        </p>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          You don’t have access to this workspace
        </h2>
        <div className="mt-4">
          <FormAlert>{state.message}</FormAlert>
        </div>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Projects unavailable
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          We could not load the projects. This is usually temporary.
        </p>

        <div className="mt-4">
          <FormAlert>{state.message}</FormAlert>
        </div>

        <button
          type="button"
          onClick={() => setRetryToken((token) => token + 1)}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <ProjectList
      orgSlug={organization.slug}
      projects={state.projects}
      canCreate={canCreate}
    />
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
            This workspace is not available. The link may be out of date, or
            you may not have access to it.
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
