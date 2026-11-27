"use client";

import { useEffect, useState } from "react";
import type { Issue } from "@/lib/issues/api";
import { resolveLoadState } from "@/lib/issues/issue-loading";
import { useGuardedLoad } from "@/lib/issues/use-guarded-load";
import { listAttempts, type Attempt } from "@/lib/issues/verification-api";
import { canWithdraw, reopenedAfter, testAccess } from "@/lib/issues/verification-values";
import { AttemptHistory } from "./attempt-history";
import { PendingFixSummary, VerifiedSummary } from "./fix-summaries";
import { primaryButton } from "./styles";
import { SubmitFixForm } from "./submit-fix-form";
import { TestFixForm } from "./test-fix-form";

/**
 * Fix and verification for one issue: submit a fix against a deployment,
 * test it, withdraw it, and every attempt so far (contract §4).
 */
export function IssueVerification({
  orgId,
  projectSlug,
  issue,
  environments,
  meId,
  memberCount,
  locked,
  onIssue,
  onWithdraw,
  onStale,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  issue: Issue;
  environments: readonly { id: string; name: string }[];
  /** The signed-in user's account id. */
  meId: string | null;
  /** Null when the members couldn't be read. */
  memberCount: number | null;
  /** Another change is saving or must be checked first. */
  locked: boolean;
  onIssue: (issue: Issue) => void;
  /** The PATCH that withdraws the pending fix; the page sends it. */
  onWithdraw: () => void;
  onStale: (message: string) => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [mode, setMode] = useState<"fix" | "test" | null>(null);
  // Bound to the status it describes, so it goes once the issue moves on.
  const [notice, setNotice] = useState<{ text: string; status: Issue["status"] } | null>(null);

  // Re-read whenever the issue changes, so a new or tested fix shows up.
  const attempts = useGuardedLoad<Attempt[]>(
    `${orgId}|${projectSlug}|${issue.number}|${issue.updatedAt}|${issue.attemptCount}`,
    async () =>
      issue.attemptCount === 0
        ? { kind: "ready", data: [] }
        : resolveLoadState(await listAttempts(orgId, projectSlug, issue.number)),
  );
  const sessionOver = attempts.state.kind === "login";
  useEffect(() => {
    if (sessionOver) onLogin();
  }, [sessionOver, onLogin]);

  const open = issue.status === "NEW" || issue.status === "IN_PROGRESS";
  const pending = issue.status === "READY_FOR_VERIFICATION" ? issue.pendingFix : null;
  const access = pending ? testAccess(pending, meId, memberCount) : "allowed";
  const reopened = attempts.state.kind === "ready" ? reopenedAfter(issue.status, attempts.state.data) : null;

  if (issue.attemptCount === 0 && !open) return null;

  function done(message: string, next: Issue) {
    setMode(null);
    setNotice({ text: message, status: next.status });
    onIssue(next);
  }

  function stale(message: string) {
    setMode(null);
    setNotice(null);
    onStale(message);
  }

  const forms = { orgId, projectSlug, issueNumber: issue.number, onStale: stale, onCancel: () => setMode(null), onGone, onLogin };

  return (
    <section aria-labelledby="verification-heading" className="space-y-4 rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="verification-heading" className="text-base font-semibold text-foreground">
            Fix and verification
          </h2>
          {reopened !== null ? (
            <span className="inline-flex items-center rounded-md border border-status-blocked/40 bg-status-blocked/10 px-2 py-0.5 text-xs font-medium text-status-blocked-foreground">
              Reopened · attempt {reopened}
            </span>
          ) : null}
        </div>
        {/* Always rendered, so the announcement isn't lost. */}
        <p role="status" className="text-sm text-muted-foreground [&:not(:empty)]:mt-2">
          {notice?.status === issue.status ? notice.text : null}
        </p>
      </div>

      {open && mode === "fix" ? (
        <SubmitFixForm
          {...forms}
          issueEnvironment={issue.environment}
          environments={environments}
          onSubmitted={(write) => done(`Fix submitted in ${write.fix.deployment.label}. It’s waiting to be tested.`, write.issue)}
        />
      ) : open ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {issue.attemptCount === 0
              ? "No fix submitted yet. Once one is deployed, submit it so a teammate can test it."
              : "It needs a new fix before it can be tested again."}
          </p>
          <button type="button" onClick={() => setMode("fix")} disabled={locked} className={primaryButton}>
            Submit a fix
          </button>
        </div>
      ) : null}

      {pending ? (
        mode === "test" && access !== "own-fix" ? (
          <TestFixForm
            {...forms}
            fix={pending}
            environmentName={issue.environment?.name ?? "this environment"}
            selfVerify={access === "self"}
            onRecorded={({ verification, issue: next }) =>
              done(
                verification.result === "PASS"
                  ? `Passed on ${verification.deployment.label}. The issue is verified.`
                  : `Marked as failed on ${verification.deployment.label}. The issue is back in progress.`,
                next,
              )
            }
          />
        ) : (
          <PendingFixSummary
            fix={pending}
            access={access}
            canWithdraw={canWithdraw(pending, meId)}
            locked={locked}
            onTest={() => setMode("test")}
            onWithdraw={() => {
              setNotice(null);
              onWithdraw();
            }}
          />
        )
      ) : null}

      {issue.verifiedOn ? <VerifiedSummary verified={issue.verifiedOn} /> : null}

      {issue.attemptCount > 0 ? (
        <AttemptHistory state={attempts.state} pendingFixId={pending?.id ?? null} onRetry={attempts.retry} />
      ) : null}
    </section>
  );
}
