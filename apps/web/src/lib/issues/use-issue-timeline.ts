"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createRequestGuard } from "@/lib/projects/project-detail";
import { listTimeline, type IssueComment, type TimelinePage } from "./comments-api";
import { resolveLoadState, type LoadState } from "./issue-loading";
import { appendEntries, markCommentDeleted, readTimeline, upsertComment } from "./timeline";

/**
 * One issue's timeline, oldest first. `refreshKey` (the issue's `updatedAt`)
 * changes when a field is saved; the timeline is then re-read in the
 * background so the new history entry appears without a loading flash.
 */
export function useIssueTimeline(orgId: string, projectSlug: string, number: number, refreshKey: string) {
  const key = `${orgId}|${projectSlug}|${number}`;
  const [stored, setStored] = useState<{ key: string; state: LoadState<TimelinePage> } | null>(null);
  const [more, setMore] = useState<{ key: string; pending: boolean; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const guard = useRef(createRequestGuard());

  const state: LoadState<TimelinePage> = stored && stored.key === key ? stored.state : { kind: "loading" };
  const moreState = more && more.key === key ? more : { pending: false, failed: false };
  const fetchPage = (cursor: string | null) => listTimeline(orgId, projectSlug, number, cursor);

  const read = useEffectEvent(() => {
    const shown = stored && stored.key === key && stored.state.kind === "ready" ? stored.state.data : null;
    return { refreshing: shown !== null, request: readTimeline(fetchPage, shown ? shown.entries.length : 0) };
  });

  useEffect(() => {
    const token = guard.current.start();
    const { refreshing, request } = read();
    void request.then((outcome) => {
      if (!guard.current.accept(token)) return;
      const next = resolveLoadState(outcome);
      // A background re-read that fails keeps what is already on screen.
      if (refreshing && (next.kind === "unavailable" || next.kind === "forbidden")) return;
      setStored({ key, state: next });
    });
  }, [key, refreshKey, attempt]);

  function update(change: (page: TimelinePage) => TimelinePage) {
    setStored((current) =>
      current && current.key === key && current.state.kind === "ready"
        ? { key, state: { kind: "ready", data: change(current.state.data) } }
        : current,
    );
  }

  async function loadMore(toEnd: boolean) {
    if (state.kind !== "ready" || !state.data.hasMore) return;
    const token = guard.current.start();
    setMore({ key, pending: true, failed: false });

    const outcome = await readTimeline(fetchPage, toEnd ? Infinity : 0, state.data.nextCursor);
    if (!guard.current.accept(token)) return setMore(null);

    if (outcome.status !== "success") {
      const next = resolveLoadState(outcome);
      if (next.kind === "login" || next.kind === "not-found") setStored({ key, state: next });
      return setMore({ key, pending: false, failed: true });
    }
    update((page) => ({
      entries: appendEntries(page.entries, outcome.data.entries),
      nextCursor: outcome.data.nextCursor,
      hasMore: outcome.data.hasMore,
    }));
    setMore(null);
  }

  /** Re-reads every page; for checking whether an unconfirmed post landed. */
  async function recheck() {
    const token = guard.current.start();
    const outcome = await readTimeline(fetchPage, Infinity);
    if (!guard.current.accept(token) || outcome.status !== "success") return null;
    setStored({ key, state: { kind: "ready", data: outcome.data } });
    return outcome.data.entries;
  }

  return {
    state,
    more: moreState,
    retry: () => {
      setStored({ key, state: { kind: "loading" } });
      setAttempt((count) => count + 1);
    },
    loadMore: () => void loadMore(false),
    /** A new comment goes at the end, so unread pages are read first. */
    addComment: (comment: IssueComment) => {
      if (state.kind === "ready" && state.data.hasMore) return void loadMore(true);
      update((page) => ({ ...page, entries: upsertComment(page.entries, comment) }));
    },
    replaceComment: (comment: IssueComment) =>
      update((page) => ({ ...page, entries: upsertComment(page.entries, comment) })),
    removeComment: (commentId: string) =>
      update((page) => ({
        ...page,
        entries: markCommentDeleted(page.entries, commentId, new Date().toISOString()),
      })),
    recheck,
  };
}
