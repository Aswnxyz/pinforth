/**
 * The workflow a review follows in Pinforth.
 *
 * It is shown as information only: there is nothing to click, because the
 * modules behind these steps are not part of Pinforth yet.
 */
const WORKFLOW_STEPS = [
  "Feedback",
  "Triage",
  "Fix",
  "QA verification",
  "Release approval",
];

export function WorkspaceEmptyState() {
  return (
    <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
      <h2 className="text-base font-semibold text-foreground">No projects yet</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        This workspace is ready. The client websites you look after, and the
        feedback, issues and releases that belong to them, will appear here.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface-muted px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          How a review runs
        </p>
        <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm font-medium text-foreground">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              {index > 0 ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0 fill-current text-muted-foreground"
                >
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.69 8 6.22 4.53a.75.75 0 0 1 0-1.06Z" />
                </svg>
              ) : null}
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Projects are not available in Pinforth yet.
      </p>
    </section>
  );
}
