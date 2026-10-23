"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { FormAlert } from "@/components/ui/form-alert";
import { resendVerification } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";

export default function AccountPage() {
  const router = useRouter();
  const { user, memberships, isLoading, isAuthenticated, signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-surface text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          Loading your session…
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isEmailVerified = Boolean(user.emailVerifiedAt);

  async function handleResendVerification() {
    setResending(true);
    setResendStatus(null);
    try {
      const outcome = await resendVerification();
      if (outcome.success) {
        setResendStatus({ type: "success", message: outcome.message });
      } else {
        setResendStatus({ type: "error", message: outcome.message });
      }
    } catch {
      setResendStatus({
        type: "error",
        message: "Failed to send confirmation email. Please try again.",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 border-b border-border">
        <Link
          href="/"
          className="inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <PinforthLogo variant="full" size="md" />
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Overview
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border-strong bg-surface-raised px-3 py-1.5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Account Overview
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review your signed-in identity and organization memberships.
            </p>
          </div>

          {resendStatus ? (
            resendStatus.type === "success" ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-accent/30 bg-surface-highlight px-3 py-2.5 text-sm text-foreground"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="mt-0.5 size-4 shrink-0 fill-[var(--color-accent)]"
                >
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
                <p>{resendStatus.message}</p>
              </div>
            ) : (
              <FormAlert>{resendStatus.message}</FormAlert>
            )
          ) : null}

          {/* Profile Card */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8 space-y-5">
            <h2 className="text-base font-semibold text-foreground">
              Profile Information
            </h2>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Full Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {user.name || "—"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email Address
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {user.email}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Account Created
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email Verification
                </dt>
                <dd className="mt-1 flex items-center gap-2">
                  {isEmailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-status-qa-verified)]/30 bg-surface-highlight px-2.5 py-0.5 text-xs font-medium text-[var(--color-status-qa-verified-foreground)]">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        className="size-3 fill-current"
                      >
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                      Verified
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-status-qa-pending)]/30 bg-[var(--color-status-qa-pending-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-status-qa-pending-foreground)]">
                        Unverified
                      </span>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="text-xs font-medium text-accent underline-offset-4 hover:underline disabled:opacity-60"
                      >
                        {resending ? "Sending…" : "Resend confirmation"}
                      </button>
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Organizations Card */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8 space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              Organizations
            </h2>

            {memberships.length > 0 ? (
              <ul className="divide-y divide-border">
                {memberships.map((m) => (
                  <li
                    key={m.organization.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.organization.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        /{m.organization.slug}
                      </p>
                    </div>
                    <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                You do not belong to any organizations yet.
              </p>
            )}
          </div>
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-muted-foreground border-t border-border">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
