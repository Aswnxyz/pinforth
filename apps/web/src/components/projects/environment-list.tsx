import { safeWebsiteUrl } from "@/lib/projects/urls";

/**
 * The environment shape this list displays.
 *
 * Structurally compatible with the agreed `Environment` contract. `createdAt`
 * is optional here: the date is a nicety, and a caller that lacks it still
 * renders correctly.
 */
export interface EnvironmentListItem {
  name: string;
  url: string;
  /** ISO timestamp, formatted as a date for display when present. */
  createdAt?: string;
}

/**
 * The website environments configured for a project.
 *
 * Presentational and read-only: creation and editing arrive with their forms
 * and real API integration, so no inert controls are rendered here.
 */
export function EnvironmentList({
  environments,
}: {
  environments: readonly EnvironmentListItem[];
}) {
  if (environments.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No website environments configured yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs">
      {environments.map((environment) => {
        // Only a normal web address may become a link; anything else (e.g. a
        // javascript: URL) is shown as text so it can never execute on click.
        const href = safeWebsiteUrl(environment.url);

        return (
          <li key={environment.url} className="px-4 py-3">
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {environment.name}
              </span>

              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex max-w-full items-center gap-1.5 font-mono text-sm break-all text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="truncate">{href}</span>
                  <span className="sr-only">(opens in a new tab)</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3.5 shrink-0 fill-current"
                  >
                    <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.69 8 6.22 4.53a.75.75 0 0 1 1.06 0Zm0 6.3a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
                  </svg>
                </a>
              ) : (
                <span className="mt-0.5 block font-mono text-sm break-all text-muted-foreground">
                  {environment.url}
                </span>
              )}

              {environment.createdAt ? (
                <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                  Added{" "}
                  {new Date(environment.createdAt).toLocaleDateString(
                    undefined,
                    { year: "numeric", month: "short", day: "numeric" },
                  )}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
