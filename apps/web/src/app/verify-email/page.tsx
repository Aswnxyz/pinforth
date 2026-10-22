import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { VerifyEmailContent } from "./verify-email-content";

export const metadata: Metadata = {
  title: "Verify Email",
  referrer: "no-referrer",
  description: "Confirm your email address for your Pinforth workspace.",
};

export default function VerifyEmailPage() {
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
        <div className="w-full max-w-[26rem] rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <Suspense
            fallback={
              <div className="py-6 text-center text-sm text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-3 block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
                Processing confirmation link…
              </div>
            }
          >
            <VerifyEmailContent />
          </Suspense>
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
