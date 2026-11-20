"use client";

import { useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import type { IssueApiOutcome } from "@/lib/issues/api";
import { deleteComment, editComment, type IssueComment } from "@/lib/issues/comments-api";
import { describeIssueFailure } from "@/lib/issues/issue-values";
import {
  actorName,
  formatTimelineTime,
  UNCONFIRMED_COMMENT_DELETE_MESSAGE,
  UNCONFIRMED_EDIT_MESSAGE,
  validateCommentBody,
} from "@/lib/issues/timeline";
import { CommentTextarea, InternalBadge, buttonClass } from "./timeline-ui";

type Mode = "view" | "editing" | "deleting";

/** One comment. Owns its edit and delete requests; the timeline is told the result. */
export function CommentCard({
  issue,
  comment,
  canEdit,
  canDelete,
  onChanged,
  onDeleted,
  onStale,
  onLogin,
}: {
  issue: { orgId: string; projectSlug: string; number: number };
  comment: IssueComment;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: (comment: IssueComment) => void;
  onDeleted: (commentId: string) => void;
  /** The comment or issue changed elsewhere: the timeline re-reads. */
  onStale: () => void;
  onLogin: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const author = actorName(comment.author);
  const internal = comment.visibility === "INTERNAL";

  function open(next: Mode) {
    setMode(next);
    setDraft(comment.body ?? "");
    setMessage(null);
  }

  async function run<T>(request: Promise<IssueApiOutcome<T>>, unconfirmed: string, done: (data: T) => void) {
    setPending(true);
    setMessage(null);
    const outcome = await request;
    setPending(false);
    if (outcome.status === "success") return done(outcome.data);

    const failure = describeIssueFailure(outcome, unconfirmed);
    if (failure.kind === "login") return onLogin();
    // Gone, or edited after it was deleted elsewhere: the timeline shows what is true now.
    if (failure.kind === "gone" || outcome.status === "conflict") return onStale();
    setMessage(failure.message);
  }

  function save() {
    const body = draft.trim();
    const problem = validateCommentBody(body);
    if (problem) return setMessage(problem);
    if (body === comment.body) return setMode("view");
    void run(
      editComment(issue.orgId, issue.projectSlug, issue.number, comment.id, body),
      UNCONFIRMED_EDIT_MESSAGE,
      (updated) => {
        onChanged(updated);
        setMode("view");
      },
    );
  }

  function remove() {
    void run(
      deleteComment(issue.orgId, issue.projectSlug, issue.number, comment.id),
      UNCONFIRMED_COMMENT_DELETE_MESSAGE,
      () => onDeleted(comment.id),
    );
  }

  if (comment.deletedAt) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground italic">
        {author}’s comment was deleted.
      </p>
    );
  }

  return (
    <article
      className={`rounded-lg border px-4 py-3 ${internal ? "border-status-qa-pending/40 bg-status-qa-pending-bg" : "border-border bg-surface-raised"}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">{author}</span>
        <time dateTime={comment.createdAt}>{formatTimelineTime(comment.createdAt)}</time>
        {comment.editedAt ? <span title={formatTimelineTime(comment.editedAt)}>· edited</span> : null}
        {internal ? <InternalBadge /> : null}
        {mode === "view" && (canEdit || canDelete) ? (
          <span className="ml-auto flex gap-3">
            {canEdit ? (
              <button type="button" onClick={() => open("editing")} className={buttonClass.link}>
                Edit<span className="sr-only"> your comment</span>
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" onClick={() => open("deleting")} className={buttonClass.dangerLink}>
                Delete<span className="sr-only"> {author}’s comment</span>
              </button>
            ) : null}
          </span>
        ) : null}
      </header>

      {mode === "editing" ? (
        <div className="mt-2 space-y-2">
          <CommentTextarea label="Edit comment" value={draft} onChange={setDraft} onSubmit={save} disabled={pending} autoFocus />
          {message ? <FormAlert>{message}</FormAlert> : null}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} aria-busy={pending} className={buttonClass.primary}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setMode("view")} disabled={pending} className={buttonClass.secondary}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">{comment.body}</p>
      )}

      {mode === "deleting" ? (
        <div role="alertdialog" aria-label="Delete this comment?" className="mt-3 space-y-3 rounded-md border border-danger/40 bg-danger/5 p-3">
          <p className="text-sm text-foreground">Delete this comment? Everyone will see that it was deleted.</p>
          {message ? <FormAlert>{message}</FormAlert> : null}
          <div className="flex gap-2">
            <button type="button" onClick={remove} disabled={pending} aria-busy={pending} className={buttonClass.danger}>
              {pending ? "Deleting…" : "Delete comment"}
            </button>
            <button type="button" onClick={() => setMode("view")} disabled={pending} className={buttonClass.secondary} autoFocus>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
