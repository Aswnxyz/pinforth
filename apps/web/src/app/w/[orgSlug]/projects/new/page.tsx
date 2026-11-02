"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import {
  CreateProjectForm,
  type CreateProjectFieldErrors,
  type CreateProjectValues,
} from "@/components/projects/create-project-form";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import {
  canManageProjects,
  resolveOrganizationAccess,
} from "@/lib/organizations/organization-access";
import { createProject } from "@/lib/projects/api";
import {
  describeCreateProjectFailure,
  projectDestination,
} from "@/lib/projects/project-creation";

export default function NewProjectPage() {
  return (
    <WorkspaceGate>
      {/* The slug is only known at request time, so it is read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <NewProjectView />
      </Suspense>
    </WorkspaceGate>
  );
}

function NewProjectView() {
  const params = useParams<{ orgSlug: string }>();
  const { organizations } = useWorkspaces();

  // The URL slug is never trusted: the workspace must be one the signed-in
  // user can actually reach, or the state is "unavailable".
  const access = resolveOrganizationAccess(organizations, params.orgSlug);

  if (access.kind === "unavailable") {
    return <UnavailableWorkspace />;
  }

  const { organization } = access;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader organization={organization} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {organization.name} · Projects
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              New project
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              The client website this project covers. You’ll review it, track
              the issues you find and approve its releases from here.
            </p>
          </div>

          {canManageProjects(organization.role) ? (
            <CreateProjectSection organization={organization} />
          ) : (
            <PermissionDenied organization={organization} />
          )}
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

/**
 * The form plus the state of the in-flight creation.
 *
 * No project request is made until the gate resolved the session and the
 * organization, and `createProject` never throws — every failure arrives as
 * a typed outcome.
 */
function CreateProjectSection({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CreateProjectFieldErrors | null>(
    null,
  );

  async function handleCreate(values: CreateProjectValues) {
    const outcome = await createProject(organization.id, values);

    if (outcome.status === "success") {
      // The destination uses the slug the backend returned, on the
      // organization's canonical slug — never one derived on the client.
      router.replace(projectDestination(organization.slug, outcome.data.slug));
      // Keep `pending` true: the page is leaving, and if navigation is slow
      // the form must not allow a second submission.
      return;
    }

    const failure = describeCreateProjectFailure(outcome);

    if (failure.kind === "login") {
      router.replace("/login");
      return;
    }

    // The entered values stay in the form — nothing is reset on failure.
    setErrorMessage(failure.message);
    setFieldErrors(failure.fields ?? null);
    setPending(false);
  }

  return (
    <CreateProjectForm
      orgSlug={organization.slug}
      onSubmit={(values) => {
        setPending(true);
        setErrorMessage(null);
        setFieldErrors(null);
        void handleCreate(values);
      }}
      pending={pending}
      errorMessage={errorMessage}
      fieldErrors={fieldErrors}
    />
  );
}

function PermissionDenied({ organization }: { organization: OrganizationSummary }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        You can’t create projects here
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Only the workspace owner and admins can create projects in{" "}
        {organization.name}. Ask one of them to add this project, or head
        back to your workspace.
      </p>

      <Link
        href={`/w/${organization.slug}`}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
      >
        Back to {organization.name}
      </Link>
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
