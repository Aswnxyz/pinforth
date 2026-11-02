/**
 * The project shape this overview displays.
 *
 * Structurally compatible with the agreed `ProjectSummary`/`ProjectDetail`
 * contracts; replaced by the shared type when `@pinforth/shared` ships it.
 */
export interface ProjectOverviewData {
  name: string;
  slug: string;
  description: string | null;
  /** ISO timestamp, formatted as a date for display. */
  createdAt: string;
}

/**
 * The identity and details of a project.
 *
 * Presentational: the caller supplies the project and the workspace it
 * belongs to. The paths shown follow the workspace routes so the context
 * reads the same as the address bar.
 */
export function ProjectOverview({
  orgSlug,
  project,
}: {
  orgSlug: string;
  project: ProjectOverviewData;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Project
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {project.name}
      </h1>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {project.description || "No description yet."}
      </p>

      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </dt>
          <dd className="mt-1 truncate font-mono text-sm text-foreground">
            /w/{orgSlug}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project URL
          </dt>
          <dd className="mt-1 font-mono text-sm break-all text-foreground">
            /w/{orgSlug}/projects/{project.slug}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Created
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {new Date(project.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </dd>
        </div>
      </dl>
    </div>
  );
}
