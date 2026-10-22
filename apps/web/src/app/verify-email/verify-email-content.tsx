"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/ui/form-alert";
import { verifyEmail } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";

type VerificationStatus = "loading" | "success" | "expired" | "error" | "no-token";

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const [token] = useState(() => searchParams.get("token"));
  const { isAuthenticated, refreshUser } = useAuth();

  const [status, setStatus] = useState<VerificationStatus>(
    token ? "loading" : "no-token",
  );
  const [message, setMessage] = useState<string>(
    token ? "" : "No verification token was provided.",
  );
  const executedRef = useRef(false);

  useEffect(() => {
    if (!token || executedRef.current) return;
    executedRef.current = true;

    // Remove token from visible URL immediately to prevent accidental leakage in history or bookmarks
    if (typeof window !== "undefined" && window.history.replaceState) {
      window.history.replaceState({}, "", "/verify-email");
    }

    verifyEmail(token)
      .then(async (result) => {
        if (result.success) {
          setStatus("success");
          setMessage(result.message);
          await refreshUser();
        } else if (result.code === "INVALID_OR_EXPIRED_TOKEN") {
          setStatus("expired");
          setMessage(result.message);
        } else {
          setStatus("error");
          setMessage(result.message);
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Unable to verify email due to a network issue. Please try again.");
      });
  }, [token, refreshUser]);

  if (status === "loading") {
    return (
      <div className="text-center py-4">
        <span
          aria-hidden="true"
          className="mx-auto block size-6 animate-spin rounded-full border-2 border-accent border-t-transparent"
        />
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          Confirming your email
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Please wait while we verify your confirmation link…
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center py-2 space-y-4">
        <div
          aria-hidden="true"
          className="mx-auto grid size-10 place-items-center rounded-full bg-surface-highlight text-[var(--color-status-qa-verified-foreground)]"
        >
          <svg viewBox="0 0 16 16" className="size-5 fill-current">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Email Confirmed
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="pt-2">
          {isAuthenticated ? (
            <Link
              href="/account"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Continue to your account
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign in to Pinforth
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {status === "expired"
            ? "Link Expired or Invalid"
            : status === "no-token"
              ? "Invalid Link"
              : "Verification Failed"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {status === "expired"
            ? "This confirmation link has already been used or has expired."
            : status === "no-token"
              ? "This confirmation page requires a valid link from your email."
              : "We could not confirm your email address."}
        </p>
      </div>

      <FormAlert>{message}</FormAlert>

      <div className="pt-2 space-y-2">
        {isAuthenticated ? (
          <Link
            href="/account"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Go to account overview
          </Link>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Return to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
