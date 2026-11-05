"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IssueStatusBadge, IssuePriorityBadge } from "@/components/issues/issue-badges";
import { IssueContext } from "@/components/issues/issue-context";
import { IssueDeleteCard } from "@/components/issues/issue-delete-card";
import { IssueFieldsPanel } from "@/components/issues/issue-fields-panel";
import { BackLink, IssuePageShell, LoadStateView } from "@/components/issues/issue-page-shell";
import { IssueTextEditor } from "@/components/issues/issue-text-editor";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { canManageProjects } from "@/lib/organizations/organization-access";
import {
  deleteIssue,
  getIssue,
  updateIssue,
  type Issue,
  type IssueFieldErrors,
  type UpdateIssueInput,
} from "@/lib/issues/api";
import {
  assigneeOptions,
  loadIssueWorkspace,
  parseIssueNumber,
  resolveLoadState,
} from "@/lib/issues/issue-loading";
import {
  describeIssueFailure,
  issueReflects,
  prepareTextUpdate,
  UNCONFIRMED_DELETE_MESSAGE,
  UNCONFIRMED_SAVE_MESSAGE,
} from "@/lib/issues/issue-values";
import { issueReference, ISSUE_TYPE_LABELS } from "@/lib/issues/labels";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";

export default function IssueDetailPage() {
  return (
    <IssuePageShell>
      {(organization, params) => (
        <IssueDetailSection
          key={`${organization.id}|${params.projectSlug}|${params.number}`}
          organization={organization}
          projectSlug={params.projectSlug}
          number={parseIssueNumber(params.number ?? "")}
        />
      )}
    </IssuePageShell>
  );
}

/** What the screen is doing with the loaded issue, bound to its load key. */
interface Session {
  key: string;
  pending: "save" | "delete" | null;
  editingText: boolean;
  confirmingDelete: boolean;
  message: string | null;
  notice: string | null;
  fields: IssueFieldErrors | null;
  /** The last change's outcome is unknown: no more changes until re-read. */
  unconfirmed: UpdateIssueInput | "delete" | null;
}

const idle = (key: string): Session => ({
  key,
  pending: null,
  editingText: false,
  confirmingDelete: false,
  message: null,
  notice: null,
  fields: null,
  unconfirmed: null,
});

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

function IssueDetailSection({
  organization,
  projectSlug,
  number,
}: {
  organization: OrganizationSummary;
  projectSlug: string;
  /** Null for a segment that can't be an issue number: shown as not found. */
  number: number | null;
}) {
  const router = useRouter();
  const listHref = `/w/${organization.slug}/projects/${projectSlug}/issues`;

  const workspace = useGuardedLoad(`${organization.id}|${projectSlug}`, () =>
    loadIssueWorkspace(organization.id, projectSlug),
  );
  const issueLoad = useGuardedLoad<Issue>(`${organization.id}|${projectSlug}|${number}`, async () =>
    number === null
      ? { kind: "not-found" }
      : resolveLoadState(await getIssue(organization.id, projectSlug, number)),
  );

  const [stored, setSession] = useState<Session | null>(null);
  const session = stored && stored.key === issueLoad.key ? stored : idle(issueLoad.key);

  const sessionOver = workspace.state.kind === "login" || issueLoad.state.kind === "login";
  useEffect(() => {
    if (sessionOver) router.replace("/login");
  }, [sessionOver, router]);

  const back = { backHref: listHref, backLabel: "Back to issues" };
  if (workspace.state.kind !== "ready") {
    return <LoadStateView state={workspace.state} what="project" {...back} onRetry={workspace.retry} />;
  }
  if (issueLoad.state.kind !== "ready" || number === null) {
    return <LoadStateView state={issueLoad.state} what="issue" {...back} onRetry={issueLoad.retry} />;
  }

  const { project, members } = workspace.state.data;
  const issue = issueLoad.state.data;
  const key = issueLoad.key;
  const issueNumber = number;
  const change = (patch: Partial<Session>) =>
    setSession((current) => ({ ...(current && current.key === key ? current : idle(key)), ...patch }));

  async function save(changes: UpdateIssueInput) {
    // Nothing was edited, so there is no PATCH to send.
    if (Object.keys(changes).length === 0) {
      change({ editingText: false });
      return;
    }
    if (session.pending || session.unconfirmed) return;

    const token = issueLoad.guard.start();
    change({ pending: "save", message: null, notice: null, fields: null });

    const outcome = await updateIssue(organization.id, projectSlug, issueNumber, changes);
    if (!issueLoad.guard.accept(token)) return;

    if (outcome.status === "success") {
      issueLoad.update(key, () => outcome.data);
      change({ pending: null, editingText: false });
      return;
    }

    const failure = describeIssueFailure(outcome, UNCONFIRMED_SAVE_MESSAGE);
    if (failure.kind === "login") return router.replace("/login");
    if (failure.kind === "gone") return issueLoad.retry();

    // The selects fall back to the saved values; typed text stays in the editor.
    change({
      pending: null,
      message: failure.message,
      fields: failure.kind === "message" ? failure.fields ?? null : null,
      unconfirmed: failure.kind === "refresh" ? changes : null,
    });
  }

  async function remove() {
    if (session.pending) return;

    const token = issueLoad.guard.start();
    change({ pending: "delete", message: null });

    const outcome = await deleteIssue(organization.id, projectSlug, issueNumber);
    if (!issueLoad.guard.accept(token)) return;

    // Already deleted elsewhere counts as deleted.
    if (outcome.status === "success" || outcome.status === "not-found") {
      router.push(listHref);
      return;
    }

    const failure = describeIssueFailure(outcome, UNCONFIRMED_DELETE_MESSAGE);
    if (failure.kind === "login") return router.replace("/login");

    change({
      pending: null,
      message: failure.kind === "gone" ? null : failure.message,
      unconfirmed: failure.kind === "refresh" ? "delete" : null,
    });
  }

  /** Re-reads the issue after an unknown outcome; the change is never resent. */
  async function refresh() {
    const submitted = session.unconfirmed;
    const token = issueLoad.guard.start();
    change({ pending: "save", message: null });

    const outcome = await getIssue(organization.id, projectSlug, issueNumber);
    if (!issueLoad.guard.accept(token)) return;

    if (outcome.status === "success") {
      issueLoad.update(key, () => outcome.data);
      const landed = submitted !== null && submitted !== "delete" && issueReflects(outcome.data, submitted);
      change({
        ...idle(key),
        notice: landed ? "Your change was saved." : null,
        message:
          submitted && submitted !== "delete" && !landed
            ? "Your change wasn’t saved. You can try again."
            : null,
      });
      return;
    }
    if (outcome.status === "unauthorized") return router.replace("/login");
    // Gone (for a delete, that confirms it) or unreadable: the load decides.
    if (outcome.status === "not-found" && submitted === "delete") return router.push(listHref);
    if (outcome.status === "not-found") return issueLoad.retry();

    change({ pending: null, message: outcome.message });
  }

  const locked = session.pending !== null || session.unconfirmed !== null;

  return (
    <div className="space-y-6">
      <BackLink href={listHref}>Back to issues</BackLink>

      {session.notice ? (
        <p
          role="status"
          className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2.5 text-sm text-status-approved"
        >
          {session.notice}
        </p>
      ) : null}

      {session.message && !session.confirmingDelete ? (
        <div className="space-y-3">
          <FormAlert>{session.message}</FormAlert>
          {session.unconfirmed ? (
            <button type="button" onClick={() => void refresh()} disabled={session.pending !== null} className={secondaryButtonClass}>
              Refresh issue
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {session.editingText ? (
            <IssueTextEditor
              initialTitle={issue.title}
              initialDescription={issue.description ?? ""}
              pending={session.pending === "save"}
              fieldErrors={session.fields}
              onCancel={() => change({ editingText: false, message: null, fields: null })}
              onSubmit={(values) => void save(prepareTextUpdate(issue, values))}
            />
          ) : (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {project.name} · {ISSUE_TYPE_LABELS[issue.type]}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight wrap-break-word text-foreground sm:text-3xl">
                <span className="font-mono text-muted-foreground">{issueReference(issue.number)}</span>{" "}
                {issue.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <IssueStatusBadge status={issue.status} />
                <IssuePriorityBadge priority={issue.priority} />
                <button
                  type="button"
                  onClick={() => change({ editingText: true, confirmingDelete: false, message: null })}
                  disabled={locked}
                  className="ml-auto inline-flex h-9 items-center rounded-md border border-border-strong bg-surface-raised px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
                {issue.description ? (
                  <p className="text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">
                    {issue.description}
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">No description.</p>
                )}
              </div>
            </div>
          )}

          <IssueContext issue={issue} />

          {canManageProjects(organization.role) ? (
            session.confirmingDelete ? (
              <IssueDeleteCard
                number={issue.number}
                title={issue.title}
                pending={session.pending === "delete"}
                message={session.message}
                // An unconfirmed DELETE is never resent: the button checks instead.
                confirmLabel={session.unconfirmed === "delete" ? "Check if it was deleted" : undefined}
                onConfirm={() => void (session.unconfirmed === "delete" ? refresh() : remove())}
                onCancel={() => change({ confirmingDelete: false, message: null, unconfirmed: null })}
              />
            ) : (
              <button
                type="button"
                onClick={() => change({ confirmingDelete: true, editingText: false, message: null })}
                disabled={locked}
                className="text-sm font-medium text-danger underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete issue
              </button>
            )
          ) : null}
        </div>

        <IssueFieldsPanel
          issue={issue}
          assignees={members ? assigneeOptions(members) : null}
          environments={project.environments}
          disabled={locked || session.editingText}
          fieldErrors={session.editingText ? null : session.fields}
          onSave={(changes) => void save(changes)}
        />
      </div>
    </div>
  );
}
