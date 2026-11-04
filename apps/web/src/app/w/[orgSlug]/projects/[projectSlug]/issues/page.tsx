"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IssueFilters } from "@/components/issues/issue-filters";
import { IssueList } from "@/components/issues/issue-list";
import {
  BackLink,
  InlineLoading,
  IssuePageShell,
  LoadStateView,
} from "@/components/issues/issue-page-shell";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationSummary } from "@/lib/organizations/api";
import {
  hasNextPage,
  issueListQuery,
  listIssues,
  type IssueFilters as Filters,
  type IssuePage,
} from "@/lib/issues/api";
import {
  assigneeOptions,
  loadIssueWorkspace,
  mergeIssuePages,
  resolveLoadState,
} from "@/lib/issues/issue-loading";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";

const NO_FILTERS: Filters = { status: null, priority: null, type: null, assignee: null };

const primaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

export default function IssuesPage() {
  return (
    <IssuePageShell>
      {(organization, params) => (
        // Keyed by workspace and project, so filters and pages never carry over.
        <IssuesSection
          key={`${organization.id}|${params.projectSlug}`}
          organization={organization}
          projectSlug={params.projectSlug}
        />
      )}
    </IssuePageShell>
  );
}

function IssuesSection({
  organization,
  projectSlug,
}: {
  organization: OrganizationSummary;
  projectSlug: string;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const projectHref = `/w/${organization.slug}/projects/${projectSlug}`;

  const workspace = useGuardedLoad(`${organization.id}|${projectSlug}`, () =>
    loadIssueWorkspace(organization.id, projectSlug),
  );
  const issues = useGuardedLoad(
    `${organization.id}|${projectSlug}|${issueListQuery(filters)}`,
    async () => resolveLoadState(await listIssues(organization.id, projectSlug, filters)),
  );

  // The "Load more" request of the current list; another filter set derives
  // it as idle, so a late page can never land under the wrong filters.
  const [more, setMore] = useState<{ key: string; pending: boolean; message: string | null } | null>(
    null,
  );
  const activeMore = more && more.key === issues.key ? more : null;

  const sessionOver = workspace.state.kind === "login" || issues.state.kind === "login";
  useEffect(() => {
    if (sessionOver) router.replace("/login");
  }, [sessionOver, router]);

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
  const page = issues.state.kind === "ready" ? issues.state.data : null;

  async function handleLoadMore(current: IssuePage) {
    if (!hasNextPage(current) || activeMore?.pending) return;

    const key = issues.key;
    const token = issues.guard.start();
    setMore({ key, pending: true, message: null });

    const outcome = await listIssues(
      organization.id,
      projectSlug,
      filters,
      current.pagination.page + 1,
    );
    if (!issues.guard.accept(token)) return;

    if (outcome.status === "success") {
      issues.update(key, (data) => mergeIssuePages(data, outcome.data));
      setMore(null);
      return;
    }
    if (outcome.status === "unauthorized") {
      router.replace("/login");
      return;
    }

    // The issues already shown stay; only the next page is offered again.
    setMore({
      key,
      pending: false,
      message:
        outcome.status === "not-found"
          ? "This project is no longer available."
          : outcome.message,
    });
  }

  const filtered =
    filters.status !== null ||
    filters.priority !== null ||
    filters.type !== null ||
    filters.assignee !== null;

  return (
    <div className="space-y-6">
      <BackLink href={projectHref}>Back to {project.name}</BackLink>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {project.name} · Issues
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Issues
          </h1>
        </div>
        <Link href={`${projectHref}/issues/new`} className={primaryButtonClass}>
          New issue
        </Link>
      </div>

      <IssueFilters
        filters={filters}
        counts={page?.counts ?? null}
        assignees={members ? assigneeOptions(members) : null}
        onChange={setFilters}
      />

      {issues.state.kind === "loading" || issues.state.kind === "login" ? (
        <InlineLoading label="Loading issues…" />
      ) : issues.state.kind === "not-found" ? (
        <FormAlert>This project is no longer available. It may have been removed.</FormAlert>
      ) : issues.state.kind !== "ready" ? (
        <div className="space-y-3">
          <FormAlert>{issues.state.message}</FormAlert>
          {issues.state.kind === "unavailable" ? (
            <button type="button" onClick={issues.retry} className={secondaryButtonClass}>
              Try again
            </button>
          ) : null}
        </div>
      ) : issues.state.data.issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-raised p-6 text-center sm:p-8">
          <p className="text-sm font-medium text-foreground">
            {filtered ? "No issues match these filters." : "No issues yet."}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {filtered
              ? "Try another status or clear the filters."
              : "Issues are the problems and requests found while reviewing this website."}
          </p>
          <div className="mt-4">
            {filtered ? (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className={secondaryButtonClass}>
                Clear filters
              </button>
            ) : (
              <Link href={`${projectHref}/issues/new`} className={primaryButtonClass}>
                Create the first issue
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <IssueList
            issues={issues.state.data.issues}
            issueHref={(number) => `${projectHref}/issues/${number}`}
          />

          {activeMore?.message ? <FormAlert>{activeMore.message}</FormAlert> : null}

          {hasNextPage(issues.state.data) ? (
            <button
              type="button"
              disabled={activeMore?.pending}
              aria-busy={activeMore?.pending}
              onClick={() => {
                if (page) void handleLoadMore(page);
              }}
              className={`${secondaryButtonClass} w-full`}
            >
              {activeMore?.pending ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
