import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header className="px-5 py-5 sm:px-8 sm:py-6">
        <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-md bg-accent text-accent-foreground"
          >
            <svg viewBox="0 0 24 24" className="size-4 fill-current">
              <path
                fillRule="evenodd"
                d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
              />
            </svg>
          </span>
          Pinforth
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-2xl text-center">
          <p className="text-sm font-medium text-accent">From feedback to sign-off</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Review, verify, and approve website releases with a record everyone
            trusts.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Pinforth keeps client feedback, issue tracking, fix verification, and
            release approval in one place — so you always know which deployment
            was tested and which release was signed off.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
