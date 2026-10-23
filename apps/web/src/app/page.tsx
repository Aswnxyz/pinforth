"use client";

import Link from "next/link";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { SignOutButton, SignOutError } from "@/components/auth/sign-out-button";
import { useAuth } from "@/lib/auth/context";

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header>
        <div className="flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <PinforthLogo variant="full" size="md" />
          </Link>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20 animate-pulse rounded-md bg-surface-muted" />
            ) : isAuthenticated && user ? (
              <>
                <Link
                  href="/w"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {user.name ? `Hi, ${user.name}` : user.email}
                </Link>
                <SignOutButton className="px-3 py-1.5" />
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        <SignOutError />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-2xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3.5 py-1 text-xs font-medium text-foreground">
            From feedback to sign-off
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Review, verify, and approve website releases with a record everyone
            trusts.
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Pinforth keeps client feedback, issue tracking, fix verification, and
            release approval in one place — so you always know which deployment
            was tested and which release was signed off.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {isAuthenticated ? (
              <Link
                href="/w"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
              >
                Go to your workspace
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-5 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
