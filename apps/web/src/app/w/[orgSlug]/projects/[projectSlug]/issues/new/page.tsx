"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IssueForm } from "@/components/issues/issue-form";
import { BackLink, IssuePageShell, LoadStateView } from "@/components/issues/issue-page-shell";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { createIssue, type IssueFieldErrors } from "@/lib/issues/api";
import { assigneeOptions, loadIssueWorkspace } from "@/lib/issues/issue-loading";
import {
  describeIssueFailure,
  toCreateIssueInput,
  UNCONFIRMED_CREATE_MESSAGE,
  type IssueFormValues,
} from "@/lib/issues/issue-values";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";

export default function NewIssuePage() {
  return (
    <IssuePageShell>
      {(organization, params) => (
        <NewIssueSection
          key={`${organization.id}|${params.projectSlug}`}
          organization={organization}
          projectSlug={params.projectSlug}
        />
      )}
    </IssuePageShell>
  );
}

interface Submission {
  pending: boolean;
  message: string | null;
  fields: IssueFieldErrors | null;
  /** The last POST's outcome is unknown; another one needs an explicit click. */
  unconfirmed: boolean;
}

function NewIssueSection({
  organization,
  projectSlug,
}: {
  organization: OrganizationSummary;
  projectSlug: string;
}) {
  const router = useRouter();
  const projectHref = `/w/${organization.slug}/projects/${projectSlug}`;
  const listHref = `${projectHref}/issues`;

  const workspace = useGuardedLoad(`${organization.id}|${projectSlug}`, () =>
    loadIssueWorkspace(organization.id, projectSlug),
  );
  const [submission, setSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    if (workspace.state.kind === "login") router.replace("/login");
  }, [workspace.state.kind, router]);

  if (workspace.state.kind !== "ready") {
    return (
      <LoadStateView
        state={workspace.state}
        what="project"
        backHref={`/w/${organization.slug}`}
        backLabel={`Back to ${organization.name}`}
        onRetry={workspace.retry}
      />
    );
  }

  const { project, members } = workspace.state.data;

  async function handleSubmit(values: IssueFormValues) {
    const token = workspace.guard.start();
    setSubmission((current) => ({
      pending: true,
      message: null,
      fields: null,
      unconfirmed: current?.unconfirmed ?? false,
    }));

    const outcome = await createIssue(organization.id, projectSlug, toCreateIssueInput(values));
    if (!workspace.guard.accept(token)) return;

    if (outcome.status === "success") {
      router.push(`${listHref}/${outcome.data.number}`);
      return;
    }

    const failure = describeIssueFailure(outcome, UNCONFIRMED_CREATE_MESSAGE);

    if (failure.kind === "login") {
      router.replace("/login");
      return;
    }
    if (failure.kind === "gone") {
      // The project itself is gone; reloading shows that state.
      setSubmission(null);
      workspace.retry();
      return;
    }

    // The entered values stay in the form either way. A POST whose outcome is
    // unknown is never repeated automatically.
    setSubmission({
      pending: false,
      message: failure.message,
      fields: failure.kind === "message" ? failure.fields ?? null : null,
      unconfirmed: failure.kind === "refresh",
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href={listHref}>Back to issues</BackLink>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {project.name} · Issues
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          New issue
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <IssueForm
          assignees={members ? assigneeOptions(members) : null}
          environments={project.environments}
          onSubmit={(values) => void handleSubmit(values)}
          pending={submission?.pending ?? false}
          errorMessage={submission?.message}
          fieldErrors={submission?.fields}
          submitLabel={submission?.unconfirmed ? "Create anyway" : "Create issue"}
          cancelHref={listHref}
        />
      </div>
    </div>
  );
}
