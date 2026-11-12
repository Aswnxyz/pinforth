"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackLink, IssuePageShell, LoadStateView } from "@/components/issues/issue-page-shell";
import { InvitePanel } from "@/components/review-rounds/invite-panel";
import { ReviewRoundForm } from "@/components/review-rounds/review-round-form";
import { ReviewRoundList } from "@/components/review-rounds/review-round-list";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { canManageProjects } from "@/lib/organizations/organization-access";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";
import { createReviewRound, type ReviewRoundField } from "@/lib/review-rounds/api";
import { adjustActiveLinks, loadReviewWorkspace } from "@/lib/review-rounds/review-loading";
import {
  describeReviewFailure,
  toCreateReviewRoundInput,
  UNCONFIRMED_ROUND_MESSAGE,
  type ReviewRoundValues,
} from "@/lib/review-rounds/review-values";

export default function ReviewRoundsPage() {
  return (
    <IssuePageShell>
      {(organization, params) => (
        <ReviewRoundsSection
          key={`${organization.id}|${params.projectSlug}`}
          organization={organization}
          projectSlug={params.projectSlug}
        />
      )}
    </IssuePageShell>
  );
}

/** What the screen is doing, bound to the load it belongs to. */
interface Session {
  key: string;
  creating: {
    pending: boolean;
    message: string | null;
    fields: Partial<Record<ReviewRoundField, string>> | null;
    unconfirmed: boolean;
  } | null;
  /** The round whose invite flow is open. One at a time. */
  invitingRoundId: string | null;
}

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

function ReviewRoundsSection({
  organization,
  projectSlug,
}: {
  organization: OrganizationSummary;
  projectSlug: string;
}) {
  const router = useRouter();
  const projectHref = `/w/${organization.slug}/projects/${projectSlug}`;
  const manager = canManageProjects(organization.role);

  const load = useGuardedLoad(`${organization.id}|${projectSlug}`, () =>
    loadReviewWorkspace(organization.id, projectSlug),
  );
  const [stored, setSession] = useState<Session | null>(null);
  const session: Session =
    stored && stored.key === load.key ? stored : { key: load.key, creating: null, invitingRoundId: null };

  useEffect(() => {
    if (load.state.kind === "login") router.replace("/login");
  }, [load.state.kind, router]);

  if (load.state.kind !== "ready") {
    return (
      <LoadStateView
        state={load.state}
        what="project"
        backHref={projectHref}
        backLabel="Back to the project"
        onRetry={load.retry}
      />
    );
  }

  const { project, rounds } = load.state.data;
  const key = load.key;
  const change = (patch: Partial<Session>) =>
    setSession((current) => ({
      ...(current && current.key === key ? current : { key, creating: null, invitingRoundId: null }),
      ...patch,
    }));

  async function handleCreate(values: ReviewRoundValues) {
    const token = load.guard.start();
    change({
      creating: { pending: true, message: null, fields: null, unconfirmed: session.creating?.unconfirmed ?? false },
    });

    const outcome = await createReviewRound(organization.id, projectSlug, toCreateReviewRoundInput(values));
    if (!load.guard.accept(token)) return;

    if (outcome.status === "success") {
      load.update(key, (data) => ({ ...data, rounds: [outcome.data, ...data.rounds] }));
      // The usual next step: invite someone to the new round.
      change({ creating: null, invitingRoundId: manager ? outcome.data.id : null });
      return;
    }

    const failure = describeReviewFailure(outcome, UNCONFIRMED_ROUND_MESSAGE);
    if (failure.kind === "login") return router.replace("/login");
    if (failure.kind === "gone") return load.retry();

    change({
      creating: {
        pending: false,
        message: failure.message,
        fields: failure.kind === "message" ? failure.fields ?? null : null,
        unconfirmed: failure.kind === "refresh",
      },
    });
  }

  const busy = session.creating !== null || session.invitingRoundId !== null;

  return (
    <div className="space-y-6">
      <BackLink href={projectHref}>Back to {project.name}</BackLink>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {project.name} · Review rounds
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Review rounds
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Invite clients and testers without a Pinforth account. They open their link, land on
            the website, and report issues straight from the page.
          </p>
        </div>
        {manager && !busy && project.environments.length > 0 ? (
          <button
            type="button"
            onClick={() => change({ creating: { pending: false, message: null, fields: null, unconfirmed: false } })}
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            New review round
          </button>
        ) : null}
      </div>

      {project.environments.length === 0 ? (
        <FormAlert>
          This project has no website environments yet. A review round needs one to send reviewers
          to.{" "}
          <Link href={projectHref} className="font-semibold underline underline-offset-4">
            Add an environment
          </Link>
        </FormAlert>
      ) : null}

      {session.creating ? (
        <div className="space-y-3">
          <ReviewRoundForm
            environments={project.environments}
            onSubmit={(values) => void handleCreate(values)}
            onCancel={() => change({ creating: null })}
            pending={session.creating.pending}
            errorMessage={session.creating.message}
            fieldErrors={session.creating.fields}
            submitLabel={session.creating.unconfirmed ? "Create anyway" : "Create review round"}
          />
          {session.creating.unconfirmed ? (
            <button type="button" onClick={load.retry} className={secondaryButtonClass}>
              Refresh the list
            </button>
          ) : null}
        </div>
      ) : null}

      {rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-raised p-6 text-center sm:p-8">
          <p className="text-sm font-medium text-foreground">No review rounds yet.</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {manager
              ? "Start one when a version of the website is ready for feedback."
              : "An owner or admin can start one when the website is ready for feedback."}
          </p>
        </div>
      ) : (
        <ReviewRoundList
          rounds={rounds}
          onInvite={manager && !busy ? (round) => change({ invitingRoundId: round.id }) : undefined}
          panel={(round) =>
            session.invitingRoundId === round.id ? (
              <InvitePanel
                orgId={organization.id}
                projectSlug={projectSlug}
                round={round}
                onActiveLinksChange={(delta) =>
                  load.update(key, (data) => ({
                    ...data,
                    rounds: adjustActiveLinks(data.rounds, round.id, delta),
                  }))
                }
                onClose={() => change({ invitingRoundId: null })}
                onGone={load.retry}
                onLogin={() => router.replace("/login")}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}
