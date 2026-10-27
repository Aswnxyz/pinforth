import Link from "next/link";

/**
 * The Members entry on the workspace homepage.
 *
 * A link only: the Members route owns loading, errors and the member list, so
 * this card never fetches members just to display a count.
 */
export function MembersEntry({ slug }: { slug: string }) {
  return (
    <section
      aria-labelledby="member-management-heading"
      className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Members
      </p>
      <h2
        id="member-management-heading"
        className="mt-1 text-base font-semibold text-foreground"
      >
        Team members
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        View and manage the people who have access to this workspace.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/w/${slug}/members`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          View members
        </Link>
      </div>
    </section>
  );
}
