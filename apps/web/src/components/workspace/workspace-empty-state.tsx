/**
 * Introduces project management and the workflow a review follows.
 *
 * Informational only: the entry links live in the workspace page's project
 * section, and this card never claims how many projects the workspace has —
 * that count is only known to the Projects route, which fetches it.
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
      <h2 className="text-base font-semibold text-foreground">
        Project management
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Every client website this workspace reviews is tracked as a project.
        Create projects from the Projects page and follow each one from feedback
        to sign-off.
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
    </section>
  );
}
