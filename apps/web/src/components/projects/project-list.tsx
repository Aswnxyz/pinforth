import Link from "next/link";
import { ProjectsEmptyState } from "./projects-empty-state";

/**
 * The project shape this list displays.
 *
 * A small, local display type on purpose: the shared project contracts in
 * `@pinforth/shared` are not published yet. It carries only the fields the
 * list shows, not an API contract — swap it for `ProjectSummary` when the
 * shared package ships it.
 */
export interface ProjectListItem {
  slug: string;
  name: string;
  description: string | null;
  /** ISO timestamp, formatted as a date for display. */
  createdAt: string;
}

/**
 * The list of a workspace's projects.
 *
 * Each row links to the project detail page, which follows the agreed route
 * `/w/[orgSlug]/projects/[projectSlug]`. The list is presentational: loading,
 * error and fetching belong to the caller that will mount it once the
 * project API exists.
 */
export function ProjectList({
  orgSlug,
  projects,
  canCreate,
}: {
  orgSlug: string;
  projects: readonly ProjectListItem[];
  canCreate: boolean;
}) {
  if (projects.length === 0) {
    return <ProjectsEmptyState orgSlug={orgSlug} canCreate={canCreate} />;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs">
      {projects.map((project) => (
        <li key={project.slug}>
          <Link
            href={`/w/${orgSlug}/projects/${project.slug}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {/* min-w-0 lets truncate shrink long names inside a flex row. */}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {project.name}
              </span>
              {project.description ? (
                <span className="mt-0.5 block truncate text-sm leading-5 text-muted-foreground">
                  {project.description}
                </span>
              ) : null}
              <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                Created{" "}
                {new Date(project.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </span>

            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-4 shrink-0 fill-current text-muted-foreground"
            >
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.69 8 6.22 4.53a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
