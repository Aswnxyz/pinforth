import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header className="px-5 py-5 sm:px-8 sm:py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
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
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center sm:px-6">
        <div className="w-full max-w-[26rem] rounded-lg border border-border bg-surface-raised p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
