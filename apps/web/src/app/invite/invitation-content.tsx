"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { FormAlert } from "@/components/ui/form-alert";
import { useAuth } from "@/lib/auth/context";

import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/organizations/invitations-api";

import {
  clearInvitationToken,
  getStoredInvitationToken,
  storeInvitationToken,
} from "@/lib/organizations/invitation-session";

type PageState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "ready"; invitation: InvitationPreview };

const primaryButton =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButton =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-strong px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-60";

export function InvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    status: authStatus,
    user,
    refreshUser,
    signOut,
    signOutError,
  } = useAuth();

  // Keep the token available across login and registration.
  const [token] = useState<string | null>(
    () => searchParams.get("token")?.trim() || getStoredInvitationToken(),
  );

  const tokenRef = useRef<string | null>(token);
  const submittingRef = useRef(false);

  const [page, setPage] = useState<PageState>({
    kind: "loading",
  });

  const [retryCount, setRetryCount] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load and validate the invitation.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const stored = storeInvitationToken(token);

    // Remove the secret token from the browser address bar.
    if (searchParams.get("token")) {
      window.history.replaceState(window.history.state, "", "/invite");
    }

    if (!stored) {
      Promise.resolve().then(() => {
        if (cancelled) return;

        setPage({
          kind: "error",
          message:
            "Your browser couldn't preserve this invitation. Please enable session storage and reopen the link.",
        });
      });

      return () => {
        cancelled = true;
      };
    }

    previewInvitation(token)
      .then((result) => {
        if (cancelled) return;

        if (
          result.ok &&
          result.data?.invitation?.organization?.slug &&
          result.data.invitation.email
        ) {
          setPage({
            kind: "ready",
            invitation: result.data.invitation,
          });
          return;
        }

        if (result.status === 404 || result.status === 410) {
          clearInvitationToken();
          tokenRef.current = null;

          setPage({
            kind: result.status === 410 ? "expired" : "invalid",
          });
          return;
        }

        setPage({
          kind: "error",
          message: result.ok
            ? "The invitation response was incomplete."
            : result.message,
        });
      })
      .catch(() => {
        if (cancelled) return;

        setPage({
          kind: "error",
          message: "Unable to check this invitation. Please try again.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token, searchParams, retryCount]);

  // Accept the invitation only after an explicit user action.
  async function handleAccept() {
    if (
      page.kind !== "ready" ||
      !tokenRef.current ||
      submittingRef.current ||
      authStatus !== "authenticated" ||
      user?.email.toLowerCase() !== page.invitation.email.toLowerCase()
    ) {
      return;
    }

    const invitationToken = tokenRef.current;

    submittingRef.current = true;
    setAccepting(true);
    setActionError(null);

    try {
      const result = await acceptInvitation(invitationToken);

      if (result.ok && result.data?.organization?.slug) {
        const slug = result.data.organization.slug;

        clearInvitationToken();
        tokenRef.current = null;

        // Refresh the authenticated user's memberships.
        await refreshUser();

        router.replace(`/w/${encodeURIComponent(slug)}`);
        return;
      }

      if (result.status === 404 || result.status === 410) {
        clearInvitationToken();
        tokenRef.current = null;

        setPage({
          kind: result.status === 410 ? "expired" : "invalid",
        });
        return;
      }

      if (result.status === 401) {
        await refreshUser();

        setActionError("Your session has expired. Please sign in again.");
        return;
      }

      if (result.status === 403) {
        setActionError(
          result.message || "This account cannot accept the invitation.",
        );
        return;
      }

      setActionError(
        result.status === 0 || result.status >= 500
          ? "We couldn't confirm whether you joined. Check your workspaces before trying again."
          : result.message,
      );
    } catch {
      setActionError(
        "We couldn't confirm whether you joined. Check your workspaces before trying again.",
      );
    } finally {
      submittingRef.current = false;
      setAccepting(false);
    }
  }

  function handleRetry() {
    setActionError(null);
    setPage({ kind: "loading" });
    setRetryCount((count) => count + 1);
  }

  // A missing token should not leave the page loading forever.
  const displayedPage: PageState = token ? page : { kind: "missing" };

  // Loading state.
  if (displayedPage.kind === "loading") {
    return (
      <div
        role="status"
        className="py-4 text-center text-sm text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-3 block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
        />
        Checking your invitation...
      </div>
    );
  }

  // Missing, expired, invalid, and error states.
  if (displayedPage.kind !== "ready") {
    const title =
      displayedPage.kind === "expired"
        ? "Invitation expired"
        : displayedPage.kind === "invalid"
          ? "Invitation unavailable"
          : displayedPage.kind === "missing"
            ? "Invitation link required"
            : "Unable to load invitation";

    const message =
      displayedPage.kind === "expired"
        ? "This invitation has expired. Ask the organization owner or admin to resend it."
        : displayedPage.kind === "invalid"
          ? "This invitation has already been used, revoked, or is invalid."
          : displayedPage.kind === "missing"
            ? "Open the invitation link from your email."
            : displayedPage.message;

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>

        <FormAlert>{message}</FormAlert>

        {displayedPage.kind === "error" ? (
          <button
            type="button"
            onClick={handleRetry}
            className={secondaryButton}
          >
            Try again
          </button>
        ) : null}

        <Link href="/w" className={secondaryButton}>
          Go to workspaces
        </Link>
      </div>
    );
  }

  const invitation = displayedPage.invitation;

  const emailMatches =
    user?.email?.toLowerCase() === invitation.email.toLowerCase();

  // Valid invitation preview.
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspace invitation
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          You&apos;re invited to join {invitation.organization.name}
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {invitation.invitedBy?.name ?? "A teammate"} invited you to
          collaborate on Pinforth.
        </p>
      </div>

      {/* Invitation details */}
      <dl className="space-y-3 rounded-lg border border-border bg-surface-muted p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all font-medium">{invitation.email}</dd>
        </div>

        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">
            {invitation.role === "ADMIN" ? "Admin" : "Member"}
          </dd>
        </div>

        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Expires</dt>
          <dd className="font-medium">
            {new Date(invitation.expiresAt).toLocaleDateString()}
          </dd>
        </div>
      </dl>

      {actionError ? <FormAlert>{actionError}</FormAlert> : null}

      {/* Checking authentication */}
      {authStatus === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your account...
        </p>
      ) : authStatus === "unavailable" ? (
        <div className="space-y-3">
          <FormAlert>
            We couldn&apos;t check your session. Please try again.
          </FormAlert>

          <button
            type="button"
            onClick={() => void refreshUser()}
            className={secondaryButton}
          >
            Check session again
          </button>
        </div>
      ) : authStatus === "unauthenticated" ? (
        // Not signed in.
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in or create an account using{" "}
            <strong>{invitation.email}</strong> to continue.
          </p>

          <Link href="/login" className={primaryButton}>
            Sign in to accept
          </Link>

          <Link href="/register" className={secondaryButton}>
            Create an account
          </Link>
        </div>
      ) : !emailMatches ? (
        // Wrong account is signed in.
        <div className="space-y-3">
          <FormAlert>
            You&apos;re signed in as {user?.email}. This invitation was sent to{" "}
            {invitation.email}.
          </FormAlert>

          {signOutError ? <FormAlert>{signOutError}</FormAlert> : null}

          <button
            type="button"
            onClick={() => void signOut()}
            className={secondaryButton}
          >
            Sign out and switch account
          </button>
        </div>
      ) : (
        // Correct account is authenticated.
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Signed in as {user?.email}.
          </p>

          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={accepting}
            aria-busy={accepting}
            className={primaryButton}
          >
            {accepting ? "Joining workspace..." : "Accept invitation"}
          </button>
        </div>
      )}
    </div>
  );
}
