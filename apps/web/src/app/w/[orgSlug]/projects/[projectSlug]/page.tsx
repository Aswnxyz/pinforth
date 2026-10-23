"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { EditProjectForm } from "@/components/projects/edit-project-form";
import { EnvironmentList } from "@/components/projects/environment-list";
import { ProjectOverview } from "@/components/projects/project-overview";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import {
  canManageProjects,
  resolveOrganizationAccess,
} from "@/lib/organizations/organization-access";
import { updateProject, type UpdateProjectInput } from "@/lib/projects/api";
import {
  createEditProjectState,
  describeEditProjectFailure,
  changesAreLive,
  EDIT_NOT_SAVED_MESSAGE,
  EDIT_SAVED_DETAILS_NOT_LOADED_MESSAGE,
  UNCONFIRMED_EDIT_MESSAGE,
  type EditProjectState,
} from "@/lib/projects/project-edit";
import {
  createRequestGuard,
  loadProjectDetail,
  type ProjectDetailState,
} from "@/lib/projects/project-detail";

export default function ProjectDetailPage() {
  return (
    <WorkspaceGate>
      {/* The slugs are only known at request time, so they are read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <ProjectDetailView />
      </Suspense>
    </WorkspaceGate>
  );
}

function ProjectDetailView() {
  const params = useParams<{ orgSlug: string; projectSlug: string }>();
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
        {/* Keyed by id so a different workspace always starts from a fresh
            load — project data from one organization is never carried over
            into another. */}
        <ProjectDetailSection
          key={organization.id}
          organization={organization}
          projectSlug={params.projectSlug}
        />
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

/**
 * The project itself, plus the state of the in-flight request.
 *
 * The request addresses the organization by its backend id (never the URL
 * slug), and `loadProjectDetail` never throws — every failure arrives as a
 * typed outcome. A response from a superseded request is dropped by the
 * guard, so switching projects or workspaces can never show stale data.
 */
function ProjectDetailSection({
  organization,
  projectSlug,
}: {
  organization: OrganizationSummary;
  projectSlug: string;
}) {
  const router = useRouter();

  const [retryToken, setRetryToken] = useState(0);

  // Identifies the request this render belongs to. When it changes (another
  // project, another organization, a retry) the derived state below is
  // loading again, so data fetched under one URL is never rendered under
  // another — no effect has to reset anything.
  const requestKey = `${organization.id}|${projectSlug}|${retryToken}`;

  const [result, setResult] = useState<{
    key: string;
    state: ProjectDetailState;
  } | null>(null);

  const guard = useRef(createRequestGuard());

  useEffect(() => {
    const token = guard.current.start();

    loadProjectDetail(organization.id, projectSlug).then((state) => {
      // A newer request has started; this result belongs to the past.
      if (guard.current.accept(token)) {
        setResult({ key: requestKey, state });
      }
    });
  }, [organization.id, projectSlug, requestKey]);

  const state: ProjectDetailState =
    result && result.key === requestKey ? result.state : { kind: "loading" };

  // The editing session of this exact request key. A different key (another
  // project, another organization, a retry) always derives as "not
  // editing", so a form, its values and its errors are never carried across
  // — and a late mutation response, which checks the key before writing,
  // can never reach another project's screen.
  const [edit, setEdit] = useState<EditProjectState | null>(null);
  const activeEdit = edit && edit.key === requestKey ? edit : null;

  useEffect(() => {
    // The session was confirmed invalid by the API's refresh flow.
    if (state.kind === "login" || activeEdit?.sessionExpired) {
      router.replace("/login");
    }
  }, [state.kind, activeEdit?.sessionExpired, router]);

  if (state.kind === "loading" || state.kind === "login") {
    return <WorkspaceLoading />;
  }

  const backLink = (
    <Link
      href={`/w/${organization.slug}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
        <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.81 8l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
      </svg>
      Back to {organization.name}
    </Link>
  );

  if (state.kind === "not-found") {
    // Missing and inaccessible share this exact state, on purpose: the
    // response must not reveal whether a project exists.
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-4 rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Project not available
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            This project is not available. The link may be out of date, or
            you may not have access to it.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-4 rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            You don’t have access to this project
          </h1>
          <div className="mt-4">
            <FormAlert>{state.message}</FormAlert>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-4 rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Project unavailable
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            We could not load this project. This is usually temporary.
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
      </div>
    );
  }

  const { project } = state;

  /**
   * Reads the project back after a PATCH and reconciles the screen.
   *
   * `changes` is what was submitted (or null for a plain manual refresh);
   * when the refreshed project matches them the edit landed and the form
   * closes on backend-authoritative values, and when it does not the form
   * keeps the entered values for another try. No automatic PATCH retry ever
   * happens here — only this read.
   */
  async function runCheck(
    key: string,
    token: number,
    changes: UpdateProjectInput | null,
    patchConfirmed: boolean,
  ) {
    setEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "checking",
            message: null,
            fields: null,
            offerRefresh: false,
            patchConfirmed,
          }
        : current,
    );

    const check = await loadProjectDetail(organization.id, projectSlug);

    if (!guard.current.accept(token)) return;

    if (check.kind === "login") {
      setEdit((current) =>
        current && current.key === key
          ? { ...current, sessionExpired: true }
          : current,
      );
      return;
    }

    if (check.kind === "ready") {
      setResult({ key, state: check });

      if (changes && !changesAreLive(changes, check.project)) {
        setEdit((current) =>
          current && current.key === key
            ? {
                ...current,
                phase: "editing",
                message: EDIT_NOT_SAVED_MESSAGE,
                offerRefresh: false,
              }
            : current,
        );
        return;
      }

      setEdit(null);
      return;
    }

    if (check.kind === "not-found") {
      setEdit(null);
      setRetryToken((token) => token + 1);
      return;
    }

    // The read-back failed. The entered values stay untouched, and the
    // message depends on whether the save itself was confirmed.
    setEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "editing",
            message: patchConfirmed
              ? EDIT_SAVED_DETAILS_NOT_LOADED_MESSAGE
              : UNCONFIRMED_EDIT_MESSAGE,
            offerRefresh: true,
          }
        : current,
    );
  }

  async function handleSave(changes: UpdateProjectInput) {
    const key = requestKey;
    const token = guard.current.start();

    setEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "saving",
            changes,
            patchConfirmed: false,
            message: null,
            fields: null,
            offerRefresh: false,
          }
        : current,
    );

    const outcome = await updateProject(organization.id, projectSlug, changes);

    // A newer request superseded this one (project or organization
    // switched); its response must not touch this screen.
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      await runCheck(key, token, changes, true);
      return;
    }

    const failure = describeEditProjectFailure(outcome);

    if (failure.kind === "login") {
      setEdit((current) =>
        current && current.key === key
          ? { ...current, sessionExpired: true }
          : current,
      );
      return;
    }

    if (failure.kind === "gone") {
      setEdit(null);
      setRetryToken((token) => token + 1);
      return;
    }

    // The entered values are preserved either way: a rejected save can be
    // corrected, and an unconfirmed one must be checked before retrying.
    setEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "editing",
            message: failure.message,
            fields: failure.kind === "message" ? failure.fields ?? null : null,
            offerRefresh: failure.kind === "refresh",
          }
        : current,
    );
  }

  function handleRefresh() {
    const key = requestKey;
    const token = guard.current.start();

    void runCheck(
      key,
      token,
      activeEdit?.changes ?? null,
      activeEdit?.patchConfirmed ?? false,
    );
  }

  const secondaryButtonClass =
    "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {backLink}

      {activeEdit ? (
        <div className="space-y-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Edit project
          </h1>

          {activeEdit.message ? (
            <div className="space-y-3">
              <FormAlert>{activeEdit.message}</FormAlert>

              {activeEdit.offerRefresh ? (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className={secondaryButtonClass}
                >
                  Refresh project
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Remounts with the project, so reopening always prefills from
              the current values rather than an earlier session. */}
          <EditProjectForm
            key={requestKey}
            initialValues={{
              name: project.name,
              description: project.description,
            }}
            onSubmit={(changes) => {
              void handleSave(changes);
            }}
            pending={
              activeEdit.phase === "saving" || activeEdit.phase === "checking"
            }
            fieldErrors={activeEdit.fields}
            onCancel={() => setEdit(null)}
          />
        </div>
      ) : (
        <>
          {canManageProjects(organization.role) ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setEdit(createEditProjectState(requestKey))}
                className={secondaryButtonClass}
              >
                Edit project
              </button>
            </div>
          ) : null}

          <ProjectOverview orgSlug={organization.slug} project={project} />
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Website environments
        </h2>
        <EnvironmentList environments={project.environments} />
      </section>
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
