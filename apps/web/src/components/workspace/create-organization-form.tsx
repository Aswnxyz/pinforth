"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { resendVerification } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { focusFirstInvalid } from "@/lib/auth/validation";
import {
  createOrganization,
  ORGANIZATION_ROLE_LABELS,
  type OrganizationSummary,
} from "@/lib/organizations/api";
import {
  needsCustomSlug,
  organizationFieldErrors,
  organizationFormSchema,
  organizationSlugSchema,
  slugPreview,
  type OrganizationFieldErrors,
} from "@/lib/organizations/validation";

/** The address a workspace will live at. */
const WORKSPACE_PATH_PREFIX = "/w";

export function CreateOrganizationForm() {
  const router = useRouter();
  const {
    user,
    status: authStatus,
    errorMessage: authErrorMessage,
    refreshUser,
  } = useAuth();

  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [customSlugVisible, setCustomSlugVisible] = useState(false);
  const [errors, setErrors] = useState<OrganizationFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<OrganizationSummary | null>(null);

  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // A ref rather than state, so a second click is caught before React has
  // re-rendered with the pending state.
  const submitting = useRef(false);

  useEffect(() => {
    // Only a session the API refused sends the user to sign in.
    if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus, router]);

  const derivedSlug = slugPreview(name);
  const requiresCustomSlug = needsCustomSlug(name);
  const showCustomSlug = customSlugVisible || requiresCustomSlug;

  function handleNameChange(value: string) {
    setName(value);

    // Only re-validate a field the user has already been told is wrong.
    setErrors((current) => {
      if (!current.name) return current;

      const result = organizationFormSchema.shape.name.safeParse(value);
      const next = { ...current };

      if (result.success) {
        delete next.name;
      } else {
        next.name = result.error.issues[0]?.message ?? "Check this name.";
      }

      return next;
    });
  }

  function handleCustomSlugChange(value: string) {
    setCustomSlug(value);
    // Once the user has chosen a URL, keep the field open so the choice stays
    // visible and editable instead of silently disappearing.
    setCustomSlugVisible(true);

    setErrors((current) => {
      if (!current.slug) return current;

      const result = organizationSlugSchema.safeParse(value);
      const next = { ...current };

      if (result.success) {
        delete next.slug;
      } else {
        next.slug = result.error.issues[0]?.message ?? "Check this URL.";
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    setFormError(null);

    const result = organizationFormSchema.safeParse({
      name,
      slug: customSlug.trim() || undefined,
    });

    if (!result.success) {
      const fieldErrors = organizationFieldErrors(result.error.issues);
      setErrors(fieldErrors);
      focusFirstInvalid(event.currentTarget, Object.keys(fieldErrors));
      return;
    }

    // The backend cannot derive a URL from this name, so one has to be chosen.
    if (needsCustomSlug(result.data.name) && !result.data.slug) {
      const fieldErrors: OrganizationFieldErrors = {
        slug: "Choose a URL for your workspace.",
      };
      setErrors(fieldErrors);
      focusFirstInvalid(event.currentTarget, ["slug"]);
      return;
    }

    submitting.current = true;
    setPending(true);
    setErrors({});

    try {
      const chosenSlug = result.data.slug?.trim()
        ? result.data.slug
        : undefined;

      const outcome = await createOrganization(
        chosenSlug
          ? { name: result.data.name, slug: chosenSlug }
          : { name: result.data.name },
      );

      if (outcome.status === "success") {
        setCreated(outcome.organization);
        await refreshUser();
        return;
      }

      if (outcome.status === "unauthorized") {
        router.replace("/login");
        return;
      }

      if (outcome.status === "rejected") {
        if (outcome.fields) {
          setErrors(outcome.fields);
        } else {
          setFormError(outcome.message);
        }
        return;
      }

      setFormError(outcome.message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    setResendStatus(null);

    try {
      const outcome = await resendVerification();
      setResendStatus({
        type: outcome.success ? "success" : "error",
        message: outcome.message,
      });
    } catch {
      setResendStatus({
        type: "error",
        message: "Failed to send confirmation email. Please try again.",
      });
    } finally {
      setResending(false);
    }
  }

  if (created) {
    // The creation response is its own proof that the organization exists, so
    // the confirmation is shown even if the session check afterwards fails.
    return (
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto grid size-10 place-items-center rounded-full bg-surface-highlight text-[var(--color-status-qa-verified-foreground)]"
        >
          <svg viewBox="0 0 16 16" className="size-5 fill-current">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </div>

        <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          Workspace created
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {created.name} is ready to use.
        </p>

        <dl className="mt-6 rounded-lg border border-border bg-surface-muted px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-4 py-1">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace
            </dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {created.name}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-1 pt-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              URL
            </dt>
            <dd className="truncate font-mono text-sm text-foreground">
              {WORKSPACE_PATH_PREFIX}/{created.slug}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-1 pt-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your role
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {ORGANIZATION_ROLE_LABELS[created.role]}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-2">
          <Link
            href={`/w/${created.slug}`}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open workspace
          </Link>
          <Link
            href="/account"
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View your account
          </Link>
        </div>
      </div>
    );
  }

  if (authStatus === "unavailable") {
    return (
      <SessionUnavailable
        message={authErrorMessage ?? "We could not reach Pinforth."}
        onRetry={() => void refreshUser()}
      />
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="mr-3 size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
        />
        Loading your session…
      </div>
    );
  }

  const isEmailVerified = Boolean(user?.emailVerifiedAt);

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <TextField
        label="Workspace name"
        name="name"
        autoComplete="organization"
        required
        placeholder="Acme Digital Studio"
        hint="Your agency, or your own name if you work on your own."
        value={name}
        onChange={handleNameChange}
        error={errors.name}
      />

      {derivedSlug ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace URL
          </p>
          <p className="mt-1 font-mono text-sm text-foreground">
            {WORKSPACE_PATH_PREFIX}/{derivedSlug}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            If this address is already taken, Pinforth adds a short suffix.
          </p>
        </div>
      ) : null}

      {showCustomSlug ? (
        <div className="space-y-1.5">
          {requiresCustomSlug ? (
            <p className="text-xs leading-5 text-muted-foreground">
              This name can&rsquo;t be turned into a URL automatically, so choose one
              below.
            </p>
          ) : null}
          <TextField
            label="Workspace URL"
            name="slug"
            placeholder="acme-studio"
            hint="Lowercase letters, numbers and single hyphens."
            value={customSlug}
            onChange={handleCustomSlugChange}
            error={errors.slug}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustomSlugVisible(true)}
          className="rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Choose a different URL
        </button>
      )}

      <SubmitButton pending={pending} pendingLabel="Creating workspace…">
        Create workspace
      </SubmitButton>

      {!isEmailVerified ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Confirm your email address to secure your account.{" "}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              className="rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {resending ? "Sending…" : "Resend confirmation"}
            </button>
          </p>
          {resendStatus ? (
            <p
              role={resendStatus.type === "error" ? "alert" : "status"}
              className={`mt-2 text-xs leading-5 ${
                resendStatus.type === "error" ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {resendStatus.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
