"use client";

import { useEffect, useEffectEvent } from "react";
import { InlineLoading } from "@/components/issues/issue-page-shell";
import { FormAlert } from "@/components/ui/form-alert";
import { useAuth } from "@/lib/auth/context";
import type { Issue } from "@/lib/issues/api";
import { reporterName } from "@/lib/issues/labels";
import {
  actorName,
  canDeleteComment,
  canEditComment,
  describeActivity,
  entryKey,
  formatTimelineTime,
} from "@/lib/issues/timeline";
import { useIssueTimeline } from "@/lib/issues/use-issue-timeline";
import { CommentCard } from "./comment-card";
import { CommentComposer } from "./comment-composer";
import { buttonClass } from "./timeline-ui";

function HistoryLine({ who, what, at }: { who: string; what: string; at: string }) {
  return (
    <li className="flex items-start gap-3 px-1 text-sm text-muted-foreground">
      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-border-strong" />
      <p className="min-w-0 wrap-break-word">
        <span className="font-medium text-foreground">{who}</span> {what}
        <span className="whitespace-nowrap"> · <time dateTime={at}>{formatTimelineTime(at)}</time></span>
      </p>
    </li>
  );
}

/**
 * Comments, internal notes and history of one issue, oldest first. The
 * opening line comes from the issue itself: issues created before history
 * existed have no "created" entry, and guest-reported ones have no actor.
 */
export function IssueTimeline({
  orgId,
  projectSlug,
  issue,
  isManager,
  onIssueGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  issue: Issue;
  isManager: boolean;
  onIssueGone: () => void;
  onLogin: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const timeline = useIssueTimeline(orgId, projectSlug, issue.number, issue.updatedAt);
  const ids = { orgId, projectSlug, number: issue.number };
  const { state } = timeline;

  const leave = useEffectEvent((kind: "login" | "not-found") => (kind === "login" ? onLogin() : onIssueGone()));
  useEffect(() => {
    if (state.kind === "login" || state.kind === "not-found") leave(state.kind);
  }, [state.kind]);

  const recheck = () => void timeline.recheck();

  return (
    <section aria-labelledby="issue-activity" className="space-y-4">
      <h2 id="issue-activity" className="text-lg font-semibold tracking-tight text-foreground">
        Activity
      </h2>

      {state.kind === "ready" ? (
        <>
          <ol className="space-y-3">
            <HistoryLine who={reporterName(issue)} what="opened this issue" at={issue.createdAt} />
            {state.data.entries.map((entry) =>
              entry.type === "COMMENT" ? (
                <li key={entryKey(entry)}>
                  <CommentCard
                    issue={ids}
                    comment={entry}
                    canEdit={canEditComment(entry, userId)}
                    canDelete={canDeleteComment(entry, userId, isManager)}
                    onChanged={timeline.replaceComment}
                    onDeleted={timeline.removeComment}
                    onStale={recheck}
                    onLogin={onLogin}
                  />
                </li>
              ) : entry.activityType === "ISSUE_CREATED" ? null : (
                <HistoryLine
                  key={entryKey(entry)}
                  who={actorName(entry.actor)}
                  what={describeActivity(entry)}
                  at={entry.createdAt}
                />
              ),
            )}
          </ol>

          {state.data.hasMore ? (
            <div className="space-y-2">
              {timeline.more.failed ? <FormAlert>We couldn’t load more activity. Try again.</FormAlert> : null}
              <button
                type="button"
                onClick={timeline.loadMore}
                disabled={timeline.more.pending}
                aria-busy={timeline.more.pending}
                className={buttonClass.secondary}
              >
                {timeline.more.pending ? "Loading…" : "Show more activity"}
              </button>
            </div>
          ) : null}

          <CommentComposer
            issue={ids}
            userId={userId}
            shownKeys={() => new Set(state.data.entries.map(entryKey))}
            onPosted={timeline.addComment}
            recheck={timeline.recheck}
            onGone={onIssueGone}
            onLogin={onLogin}
          />
        </>
      ) : state.kind === "unavailable" || state.kind === "forbidden" ? (
        <div className="space-y-3">
          <FormAlert>{state.message}</FormAlert>
          <button type="button" onClick={timeline.retry} className={buttonClass.secondary}>
            Try again
          </button>
        </div>
      ) : (
        <InlineLoading label="Loading activity…" />
      )}
    </section>
  );
}
