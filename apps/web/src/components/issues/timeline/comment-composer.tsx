"use client";

import { useRef, useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import {
  createComment,
  type CommentVisibility,
  type IssueComment,
  type TimelineEntry,
} from "@/lib/issues/comments-api";
import { describeIssueFailure } from "@/lib/issues/issue-values";
import {
  findPostedComment,
  UNCONFIRMED_COMMENT_MESSAGE,
  validateCommentBody,
} from "@/lib/issues/timeline";
import { CommentTextarea, buttonClass } from "./timeline-ui";

const CHOICES: { value: CommentVisibility; title: string; hint: string }[] = [
  { value: "INTERNAL", title: "Internal note", hint: "Only your team can see it." },
  { value: "PUBLIC", title: "Public comment", hint: "Can be shown to the client." },
];

/**
 * Writes a comment. Internal is the default, so nothing reaches a client by
 * accident. A post with an unknown outcome is never resent on its own: the
 * next click checks the timeline first.
 */
export function CommentComposer({
  issue,
  userId,
  shownKeys,
  onPosted,
  recheck,
  onGone,
  onLogin,
}: {
  issue: { orgId: string; projectSlug: string; number: number };
  userId: string | null;
  /** The entries on screen right now, to tell a new comment from an old one. */
  shownKeys: () => ReadonlySet<string>;
  onPosted: (comment: IssueComment) => void;
  recheck: () => Promise<TimelineEntry[] | null>;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("INTERNAL");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const before = useRef<ReadonlySet<string>>(new Set());

  async function post() {
    const body = draft.trim();
    const problem = validateCommentBody(body);
    if (problem) return setMessage(problem);

    before.current = shownKeys();
    setPending(true);
    setMessage(null);
    setNotice(null);
    const outcome = await createComment(issue.orgId, issue.projectSlug, issue.number, { body, visibility });
    setPending(false);

    if (outcome.status === "success") {
      setDraft("");
      setUnconfirmed(false);
      return onPosted(outcome.data);
    }
    const failure = describeIssueFailure(outcome, UNCONFIRMED_COMMENT_MESSAGE);
    if (failure.kind === "login") return onLogin();
    if (failure.kind === "gone") return onGone();
    setUnconfirmed(failure.kind === "refresh");
    setMessage(failure.message);
  }

  async function check() {
    setPending(true);
    setMessage(null);
    const entries = await recheck();
    setPending(false);
    if (!entries) return setMessage("We couldn't check the timeline right now. Try again in a moment.");

    setUnconfirmed(false);
    if (userId && findPostedComment(entries, before.current, userId, draft.trim())) {
      setDraft("");
      return setNotice("Your comment was posted.");
    }
    setMessage("It wasn't posted. You can send it now.");
  }

  const submitLabel = visibility === "INTERNAL" ? "Add internal note" : "Post comment";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <fieldset>
        <legend className="sr-only">Who can see it</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHOICES.map((choice) => (
            <label
              key={choice.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${visibility === choice.value ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <input
                type="radio"
                name={`visibility-${issue.number}`}
                value={choice.value}
                checked={visibility === choice.value}
                onChange={() => setVisibility(choice.value)}
                disabled={pending}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="block font-medium text-foreground">{choice.title}</span>
                <span className="block text-xs text-muted-foreground">{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <CommentTextarea
        label={visibility === "INTERNAL" ? "Write an internal note" : "Write a public comment"}
        value={draft}
        onChange={(value) => {
          setDraft(value);
          setNotice(null);
        }}
        onSubmit={() => void (unconfirmed ? check() : post())}
        disabled={pending}
        placeholder={visibility === "INTERNAL" ? "Write a note for your team…" : "Write a comment…"}
      />

      {message ? <FormAlert>{message}</FormAlert> : null}
      <p role="status" className="text-sm text-status-approved empty:hidden">
        {notice}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {unconfirmed ? (
          <>
            <button type="button" onClick={() => void check()} disabled={pending} className={buttonClass.primary}>
              {pending ? "Checking…" : "Check if it was posted"}
            </button>
            <button type="button" onClick={() => void post()} disabled={pending} className={buttonClass.secondary}>
              Post anyway
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void post()} disabled={pending} aria-busy={pending} className={buttonClass.primary}>
            {pending ? "Posting…" : submitLabel}
          </button>
        )}
        <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
      </div>
    </div>
  );
}
