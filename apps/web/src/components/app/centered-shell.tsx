import Link from "next/link";
import type { ReactNode } from "react";
import { PinforthLogo } from "@/components/brand/pinforth-logo";

/**
 * The centred card shell used by standalone pages, such as onboarding.
 *
 * The card is wider than the sign-in card because these pages carry more
 * explanatory copy, but it uses the same Porcelain & Moss surfaces, border
 * and shadow so the pages read as one product.
 */
export function CenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header className="px-5 py-5 sm:px-8 sm:py-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <PinforthLogo variant="full" size="md" />
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center sm:px-6">
        <div className="w-full max-w-xl rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          {children}
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
