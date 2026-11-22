import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createComment,
  deleteComment,
  editComment,
  listTimeline,
  type ActivityEntry,
  type CommentEntry,
  type IssueComment,
  type TimelinePage,
} from "@/lib/issues/comments-api";
import {
  appendEntries,
  canDeleteComment,
  canEditComment,
  describeActivity,
  findPostedComment,
  entryKey,
  markCommentDeleted,
  readTimeline,
  upsertComment,
  validateCommentBody,
} from "@/lib/issues/timeline";

/** Pins docs/contracts/issue-comments-timeline-v1.md. */

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const BASE = `/api/v1/organizations/${ORG_ID}/projects/site/issues/7`;
const ME = "user-me";

const comment = (over: Partial<CommentEntry> = {}): CommentEntry => ({
  ...plainComment(),
  type: "COMMENT",
  ...over,
});

const plainComment = (over: Partial<IssueComment> = {}): IssueComment => ({
  id: "c-1",
  issueId: "issue-1",
  author: { id: ME, name: "Priya" },
  body: "Broken on Safari.",
  visibility: "PUBLIC",
  createdAt: "2026-11-16T09:20:00.000Z",
  editedAt: null,
  deletedAt: null,
  ...over,
});

const activity = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: "a-1",
  type: "ACTIVITY",
  activityType: "STATUS_CHANGED",
  actor: { id: "user-2", name: "Sachin" },
  oldValue: "NEW",
  newValue: "IN_PROGRESS",
  createdAt: "2026-11-16T10:00:00.000Z",
  ...over,
});

function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("timeline client", () => {
  it("reads a page with the cursor and the largest page size", async () => {
    const calls = stubFetch({
      success: true,
      data: { timeline: [activity(), comment()], pagination: { limit: 100, nextCursor: "abc", hasMore: true } },
    });
    const outcome = await listTimeline(ORG_ID, "site", 7, "prev");
    expect(outcome).toEqual({
      status: "success",
      data: { entries: [activity(), comment()], nextCursor: "abc", hasMore: true },
    });
    expect(calls[0].url).toContain(`${BASE}/timeline?limit=100&cursor=prev`);
  });

  it("keeps an activity type it doesn't know yet, instead of failing the page", async () => {
    stubFetch({
      success: true,
      data: { timeline: [activity({ activityType: "FIX_SUBMITTED" })], pagination: { limit: 100, nextCursor: null, hasMore: false } },
    });
    expect((await listTimeline(ORG_ID, "site", 7, null)).status).toBe("success");
  });

  it("treats a malformed page as unavailable", async () => {
    stubFetch({
      success: true,
      data: { timeline: [comment({ visibility: "SECRET" as never })], pagination: { limit: 100, nextCursor: null, hasMore: false } },
    });
    expect((await listTimeline(ORG_ID, "site", 7, null)).status).toBe("unavailable");

    stubFetch({ success: true, data: { timeline: [], pagination: { limit: 100, nextCursor: null, hasMore: true } } });
    expect((await listTimeline(ORG_ID, "site", 7, null)).status).toBe("unavailable");
  });

  it("posts, edits and deletes comments", async () => {
    const plain = plainComment();
    let calls = stubFetch({ success: true, data: { comment: plain } }, 201);
    expect(await createComment(ORG_ID, "site", 7, { body: "Hi", visibility: "INTERNAL" })).toEqual({ status: "success", data: plain });
    expect(calls[0]).toMatchObject({ url: expect.stringContaining(`${BASE}/comments`), init: { method: "POST", body: '{"body":"Hi","visibility":"INTERNAL"}' } });

    calls = stubFetch({ success: true, data: { comment: plain } });
    await editComment(ORG_ID, "site", 7, "c-1", "Edited");
    expect(calls[0]).toMatchObject({ url: expect.stringContaining(`${BASE}/comments/c-1`), init: { method: "PATCH", body: '{"body":"Edited"}' } });

    stubFetch({ success: true, data: { deleted: true, commentId: "c-1" } });
    expect(await deleteComment(ORG_ID, "site", 7, "c-1")).toEqual({ status: "success", data: { deleted: true, commentId: "c-1" } });
  });

  it("surfaces the API's message for a rejected body", async () => {
    stubFetch({ success: false, code: "VALIDATION_ERROR", message: "Request validation failed", details: [{ path: "body", message: "Comment is required" }] }, 400);
    expect(await createComment(ORG_ID, "site", 7, { body: " ", visibility: "PUBLIC" })).toEqual({ status: "rejected", message: "Comment is required" });
  });
});

describe("timeline helpers", () => {
  const page = (entries: TimelinePage["entries"], nextCursor: string | null) => ({
    status: "success" as const,
    data: { entries, nextCursor, hasMore: nextCursor !== null },
  });

  it("reads pages until it has enough entries or reaches the end", async () => {
    const fetchPage = vi.fn(async (cursor: string | null) =>
      cursor === null ? page([activity({ id: "1" })], "p2") : cursor === "p2" ? page([activity({ id: "2" })], "p3") : page([activity({ id: "3" })], null),
    );
    expect((await readTimeline(fetchPage, 0)).status).toBe("success");
    expect(fetchPage).toHaveBeenCalledTimes(1);

    fetchPage.mockClear();
    const all = await readTimeline(fetchPage, Infinity);
    expect(all.status === "success" && all.data.entries.map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(all.status === "success" && all.data.hasMore).toBe(false);
  });

  it("keys entries by type, since ids only are unique per table", () => {
    const a = activity({ id: "x" });
    const c = comment({ id: "x" });
    expect(appendEntries([a], [a, c])).toEqual([a, c]);
    expect(entryKey(a)).not.toBe(entryKey(c));
  });

  it("adds a new comment at the end and replaces an edited one in place", () => {
    const first = comment();
    const edited = plainComment({ body: "Edited", editedAt: "2026-11-16T11:00:00.000Z" });
    const entries = [first, activity()];
    expect(upsertComment(entries, edited)[0]).toMatchObject({ body: "Edited", type: "COMMENT" });
    expect(upsertComment(entries, { ...edited, id: "c-2" })).toHaveLength(3);
  });

  it("turns a deleted comment into a tombstone", () => {
    const [gone] = markCommentDeleted([comment()], "c-1", "2026-11-17T00:00:00.000Z");
    expect(gone).toMatchObject({ body: null, deletedAt: "2026-11-17T00:00:00.000Z" });
  });

  it("finds an unconfirmed post only among new comments by the same person and text", () => {
    const old = comment({ id: "old", body: "Same" });
    const known = new Set([entryKey(old)]);
    expect(findPostedComment([old], known, ME, "Same")).toBeUndefined();
    expect(findPostedComment([old, comment({ id: "new", body: "Same" })], known, ME, "Same")?.id).toBe("new");
    expect(findPostedComment([comment({ id: "x", body: "Same", author: { id: "other", name: null } })], known, ME, "Same")).toBeUndefined();
  });

  it("describes history in plain words", () => {
    expect(describeActivity(activity())).toBe("changed status from New to In progress");
    expect(describeActivity(activity({ activityType: "ASSIGNEE_CHANGED", oldValue: null, newValue: { id: "m", name: "Rahul" } }))).toBe("assigned this issue to Rahul");
    expect(describeActivity(activity({ activityType: "ASSIGNEE_CHANGED", oldValue: { id: "m", name: "Rahul" }, newValue: null }))).toBe("unassigned Rahul");
    expect(describeActivity(activity({ activityType: "TITLE_CHANGED", oldValue: "a", newValue: "Better title" }))).toBe("changed the title to “Better title”");
    expect(describeActivity(activity({ activityType: "STATUS_CHANGED", newValue: "VERIFIED" }))).toBe("changed status from New to VERIFIED");
    expect(describeActivity(activity({ activityType: "SOMETHING_NEW" }))).toBe("updated this issue");
  });

  it("lets authors edit, and authors or managers delete", () => {
    const mine = comment();
    const theirs = comment({ author: { id: "other", name: null } });
    expect(canEditComment(mine, ME)).toBe(true);
    expect(canEditComment(theirs, ME)).toBe(false);
    expect(canDeleteComment(theirs, ME, false)).toBe(false);
    expect(canDeleteComment(theirs, ME, true)).toBe(true);
    expect(canEditComment(comment({ deletedAt: "x", body: null }), ME)).toBe(false);
  });

  it("validates the body like the API", () => {
    expect(validateCommentBody("   ")).not.toBeNull();
    expect(validateCommentBody("x".repeat(10001))).not.toBeNull();
    expect(validateCommentBody(" ok ")).toBeNull();
  });
});
