import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIssue,
  deleteIssue,
  getIssue,
  hasNextPage,
  issueListQuery,
  listIssues,
  updateIssue,
  type Issue,
  type IssuePage,
  type IssueSummary,
} from "@/lib/issues/api";
import { personName, reporterName } from "@/lib/issues/labels";
import {
  assigneeOptions,
  loadIssueWorkspace,
  mergeIssuePages,
  parseIssueNumber,
  resolveLoadState,
} from "@/lib/issues/issue-loading";
import {
  describeIssueFailure,
  EMPTY_ISSUE_VALUES,
  issueReflects,
  prepareTextUpdate,
  toCreateIssueInput,
  UNCONFIRMED_SAVE_MESSAGE,
  validateIssueValues,
} from "@/lib/issues/issue-values";
import { readIssueContext } from "@/components/issues/issue-context";

/**
 * These pin the contract with apps/api/src/modules/issues: the URLs, query
 * keys and bodies sent, the response shapes accepted, and how every failure
 * is mapped.
 */

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const PROJECT = "restaurant-website-redesign";
const BASE = `/api/v1/organizations/${ORG_ID}/projects/${PROJECT}/issues`;

const person = { id: "u-1", name: "Rahul", email: "rahul@example.com" };

const summary: IssueSummary = {
  id: "5d2a9c1e-0b3f-4e6a-8c7d-1f2e3a4b5c6d",
  number: 12,
  title: "Contact button does nothing on mobile",
  type: "BUG",
  priority: "HIGH",
  status: "IN_PROGRESS",
  source: "DASHBOARD",
  // The API also sends the environment's slug; extra keys are fine.
  environment: { id: "env-1", name: "Staging" },
  reporter: person,
  assignee: null,
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

const issue: Issue = {
  ...summary,
  description: "Tapping it on iOS Safari does nothing.",
  pageUrl: null,
  context: null,
};

const counts = { all: 7, NEW: 2, IN_PROGRESS: 1, READY_FOR_VERIFICATION: 0, CLOSED: 4 };
const pagination = (page: number, totalPages: number) => ({
  page,
  limit: 20,
  total: totalPages * 20,
  totalPages,
});

const NO_FILTERS = { status: null, priority: null, type: null, assignee: null };

function stubFetch(
  responder: (url: string, init: RequestInit) => Response,
): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder(String(url), init);
    }),
  );

  return calls;
}

describe("issue client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists issues with a credentialed GET and returns the page of summaries", async () => {
    const page = { issues: [summary], pagination: pagination(1, 2), counts };
    const calls = stubFetch(() => jsonResponse({ success: true, data: page }, 200));

    const outcome = await listIssues(ORG_ID, PROJECT, NO_FILTERS);

    expect(outcome).toEqual({ status: "success", data: page });
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(new URL(calls[0].url).search).toBe("");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("sends only the filters that are set, under the API's query keys", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        { success: true, data: { issues: [], pagination: pagination(2, 2), counts } },
        200,
      ),
    );

    await listIssues(
      ORG_ID,
      PROJECT,
      { status: "NEW", priority: null, type: "BUG", assignee: "unassigned" },
      2,
    );

    const params = new URL(calls[0].url).searchParams;
    expect(Object.fromEntries(params)).toEqual({
      status: "NEW",
      type: "BUG",
      assigneeId: "unassigned",
      page: "2",
    });
  });

  it("treats a list without counts or pagination as unavailable, never as empty", async () => {
    stubFetch(() => jsonResponse({ success: true, data: { issues: [], counts } }, 200));
    expect((await listIssues(ORG_ID, PROJECT, NO_FILTERS)).status).toBe("unavailable");

    stubFetch(() =>
      jsonResponse({ success: true, data: { issues: [], pagination: pagination(1, 1) } }, 200),
    );
    expect((await listIssues(ORG_ID, PROJECT, NO_FILTERS)).status).toBe("unavailable");
  });

  it("accepts a person without a name", async () => {
    const unnamed = { ...issue, reporter: { ...person, name: null } };
    stubFetch(() => jsonResponse({ success: true, data: { issue: unnamed } }, 200));

    expect((await getIssue(ORG_ID, PROJECT, 12)).status).toBe("success");
  });

  it("accepts a guest-reported widget issue, as the API returns it", async () => {
    const guestIssue = {
      ...issue,
      source: "WIDGET",
      reporter: null,
      guest: { name: "Alice Client", email: null },
      reviewRound: { id: "r-1", name: "Sprint 14 Client QA" },
      environment: { id: "env-1", name: "Staging", slug: "staging" },
    };
    stubFetch(() => jsonResponse({ success: true, data: { issue: guestIssue } }, 200));

    expect(await getIssue(ORG_ID, PROJECT, 12)).toEqual({ status: "success", data: guestIssue });
  });

  it("rejects a malformed guest", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { issue: { ...issue, guest: { name: 5 } } } }, 200),
    );

    expect((await getIssue(ORG_ID, PROJECT, 12)).status).toBe("unavailable");
  });

  it("accepts any JSON as the widget context", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { issue: { ...issue, context: ["x"] } } }, 200),
    );

    expect((await getIssue(ORG_ID, PROJECT, 12)).status).toBe("success");
  });

  it("needs the full issue from a single-issue read, not just a summary", async () => {
    stubFetch(() => jsonResponse({ success: true, data: { issue: summary } }, 200));

    expect((await getIssue(ORG_ID, PROJECT, 12)).status).toBe("unavailable");
  });

  it("rejects an issue with an unknown status", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { issue: { ...issue, status: "VERIFIED" } } }, 200),
    );

    expect((await getIssue(ORG_ID, PROJECT, 12)).status).toBe("unavailable");
  });

  it("gets one issue by number", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: { issue } }, 200));

    const outcome = await getIssue(ORG_ID, PROJECT, 12);

    expect(outcome).toEqual({ status: "success", data: issue });
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/12`);
  });

  it("creates with a POST carrying the input", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: { issue } }, 201));
    const input = { title: "Broken button", type: "BUG", priority: "HIGH" } as const;

    const outcome = await createIssue(ORG_ID, PROJECT, input);

    expect(outcome.status).toBe("success");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input);
  });

  it("patches only the given fields, keeping null to clear", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: { issue } }, 200));

    await updateIssue(ORG_ID, PROJECT, 12, { assigneeId: null });

    expect(calls[0].init.method).toBe("PATCH");
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/12`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ assigneeId: null });
  });

  it("deletes and expects the removed issue number back", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { deleted: true, number: 12 } }, 200),
    );

    expect(await deleteIssue(ORG_ID, PROJECT, 12)).toEqual({
      status: "success",
      data: { deleted: true, number: 12 },
    });
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("maps validation errors to their fields and drops unknown paths", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Some fields need attention",
          details: [
            { path: "title", message: "Title is too short" },
            { path: "title", message: "second message is ignored" },
            { path: "assigneeId", message: "Not a member" },
            { path: "somethingElse", message: "ignored" },
          ],
        },
        400,
      ),
    );

    expect(await createIssue(ORG_ID, PROJECT, { title: "x", type: "BUG", priority: "LOW" })).toEqual({
      status: "rejected",
      message: "Some fields need attention",
      fields: { title: "Title is too short", assigneeId: "Not a member" },
    });
  });

  it.each([
    [403, { status: "forbidden", message: "Nope" }],
    [404, { status: "not-found" }],
    [409, { status: "conflict", message: "Nope" }],
    [500, { status: "unavailable", message: "Nope" }],
  ])("maps HTTP %i", async (status, expected) => {
    stubFetch(() => jsonResponse({ success: false, code: "X", message: "Nope" }, status));

    expect(await deleteIssue(ORG_ID, PROJECT, 12)).toEqual(expected);
  });

  it("maps a network failure to unavailable, so a mutation is never assumed failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect((await updateIssue(ORG_ID, PROJECT, 12, { status: "CLOSED" })).status).toBe(
      "unavailable",
    );
  });
});

describe("issueListQuery", () => {
  it("is empty without filters on the first page", () => {
    expect(issueListQuery(NO_FILTERS)).toBe("");
    expect(issueListQuery(NO_FILTERS, 1)).toBe("");
  });

  it("knows when another page exists", () => {
    expect(hasNextPage({ issues: [], pagination: pagination(1, 2), counts })).toBe(true);
    expect(hasNextPage({ issues: [], pagination: pagination(2, 2), counts })).toBe(false);
  });

  it("changes with every filter, so each filter set loads separately", () => {
    expect(issueListQuery({ ...NO_FILTERS, status: "CLOSED" })).not.toBe(
      issueListQuery({ ...NO_FILTERS, priority: "LOW" }),
    );
  });
});

describe("issue form values", () => {
  it("requires a non-blank title", () => {
    expect(validateIssueValues({ ...EMPTY_ISSUE_VALUES, title: "   " }).title).toBeDefined();
    expect(validateIssueValues({ ...EMPTY_ISSUE_VALUES, title: " a " })).toEqual({});
  });

  it("limits title and description length like the API", () => {
    expect(validateIssueValues({ ...EMPTY_ISSUE_VALUES, title: "a".repeat(255) })).toEqual({});

    const errors = validateIssueValues({
      ...EMPTY_ISSUE_VALUES,
      title: "a".repeat(256),
      description: "b".repeat(10001),
    });

    expect(Object.keys(errors).sort()).toEqual(["description", "title"]);
  });

  it("leaves unchosen optional fields out of the POST body", () => {
    expect(toCreateIssueInput({ ...EMPTY_ISSUE_VALUES, title: "  Broken  ", description: "  " })).toEqual({
      title: "Broken",
      type: "BUG",
      priority: "MEDIUM",
    });
  });

  it("includes the assignee and environment when chosen", () => {
    expect(
      toCreateIssueInput({
        ...EMPTY_ISSUE_VALUES,
        title: "Broken",
        assigneeId: "m-1",
        environmentId: "env-1",
      }),
    ).toMatchObject({ assigneeId: "m-1", environmentId: "env-1" });
  });

  it("sends only changed text, and an emptied description as null", () => {
    expect(prepareTextUpdate(issue, { title: issue.title, description: issue.description! })).toEqual({});
    expect(prepareTextUpdate(issue, { title: " New title ", description: "" })).toEqual({
      title: "New title",
      description: null,
    });
  });

  it("does not send a cleared description that was already empty", () => {
    expect(
      prepareTextUpdate({ title: "Same", description: null }, { title: "Same", description: "   " }),
    ).toEqual({});
  });
});

describe("issueReflects", () => {
  it("compares plain fields and the nested assignee and environment", () => {
    expect(issueReflects(issue, { status: "IN_PROGRESS", environmentId: "env-1" })).toBe(true);
    expect(issueReflects(issue, { assigneeId: null })).toBe(true);
    expect(issueReflects(issue, { assigneeId: "m-1" })).toBe(false);
    expect(
      issueReflects({ ...issue, assignee: { ...person, id: "m-1" } }, { assigneeId: "m-1" }),
    ).toBe(true);
    expect(issueReflects(issue, { status: "CLOSED" })).toBe(false);
  });
});

describe("describeIssueFailure", () => {
  it("keeps an unknown outcome distinct from a refusal", () => {
    expect(describeIssueFailure({ status: "unavailable", message: "down" }, UNCONFIRMED_SAVE_MESSAGE)).toEqual({
      kind: "refresh",
      message: UNCONFIRMED_SAVE_MESSAGE,
    });
    expect(describeIssueFailure({ status: "forbidden", message: "No" }, "x")).toEqual({
      kind: "message",
      message: "No",
    });
  });

  it("maps an expired session and a missing issue", () => {
    expect(describeIssueFailure({ status: "unauthorized" }, "x")).toEqual({ kind: "login" });
    expect(describeIssueFailure({ status: "not-found" }, "x")).toEqual({ kind: "gone" });
  });

  it("carries field errors from a rejection", () => {
    expect(
      describeIssueFailure({ status: "rejected", message: "Bad", fields: { title: "Too short" } }, "x"),
    ).toEqual({ kind: "message", message: "Bad", fields: { title: "Too short" } });
  });
});

describe("issue loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps read outcomes to screen states", () => {
    expect(resolveLoadState({ status: "success", data: 1 })).toEqual({ kind: "ready", data: 1 });
    expect(resolveLoadState({ status: "unauthorized" })).toEqual({ kind: "login" });
    expect(resolveLoadState({ status: "conflict", message: "m" })).toEqual({
      kind: "unavailable",
      message: "m",
    });
  });

  it("appends a page without repeating an issue already shown", () => {
    const first: IssuePage = { issues: [summary], pagination: pagination(1, 2), counts };
    const other = { ...summary, id: "other", number: 11 };
    const next: IssuePage = {
      issues: [summary, other],
      pagination: pagination(2, 2),
      counts: { ...counts, NEW: 3 },
    };

    const merged = mergeIssuePages(first, next);

    expect(merged.issues.map((item) => item.id)).toEqual([summary.id, "other"]);
    expect(merged.pagination.page).toBe(2);
    expect(hasNextPage(merged)).toBe(false);
    expect(merged.counts.NEW).toBe(3);
  });

  it.each([
    ["12", 12],
    ["1", 1],
    ["0", null],
    ["012", null],
    ["-3", null],
    ["1.5", null],
    ["abc", null],
    ["", null],
    ["99999999999", null],
  ])("parses the issue number segment %j", (segment, expected) => {
    expect(parseIssueNumber(segment)).toBe(expected);
  });

  it("offers assignees by membership id, marking the caller", () => {
    expect(
      assigneeOptions([
        { id: "m-1", role: "OWNER", joinedAt: "", user: person, isYou: true },
        { id: "m-2", role: "MEMBER", joinedAt: "", user: { ...person, id: "u-2", name: "Anu" }, isYou: false },
      ]),
    ).toEqual([
      { id: "m-1", label: "Rahul (you)" },
      { id: "m-2", label: "Anu" },
    ]);
  });

  it("names a person by email when they have no name", () => {
    expect(personName({ name: null, email: "a@example.com" })).toBe("a@example.com");
    expect(personName({ name: "  ", email: "a@example.com" })).toBe("a@example.com");
    expect(personName(person)).toBe("Rahul");
  });

  it("still loads the project when the members can't be read", async () => {
    stubFetch((url) =>
      url.endsWith("/members")
        ? jsonResponse({ success: false, message: "down" }, 500)
        : jsonResponse(
            {
              success: true,
              data: {
                project: {
                  id: "p-1",
                  name: "Site",
                  slug: PROJECT,
                  description: null,
                  createdAt: issue.createdAt,
                  updatedAt: issue.updatedAt,
                  environments: [],
                },
              },
            },
            200,
          ),
    );

    const state = await loadIssueWorkspace(ORG_ID, PROJECT);

    expect(state.kind).toBe("ready");
    if (state.kind === "ready") expect(state.data.members).toBeNull();
  });

  it("never ignores an expired session from the member read", async () => {
    stubFetch((url) =>
      url.includes("/auth/refresh") || url.endsWith("/members")
        ? jsonResponse({ success: false, message: "expired" }, 401)
        : jsonResponse({ success: false, message: "x" }, 404),
    );

    expect(await loadIssueWorkspace(ORG_ID, PROJECT)).toEqual({ kind: "login" });
  });
});

describe("readIssueContext", () => {
  const EMPTY = { selector: null, element: null, viewport: null, browser: null, userAgent: null };

  it("reads the widget's structured context", () => {
    expect(
      readIssueContext({
        selector: "main > form#checkout-form button[type='submit']",
        element: { tagName: "BUTTON", textContent: "Place Order" },
        viewport: { width: 390, height: 844, devicePixelRatio: 3 },
        browser: { userAgent: "Mozilla/5.0 (iPhone)", language: "en-US", platform: "iPhone" },
      }),
    ).toEqual({
      selector: "main > form#checkout-form button[type='submit']",
      element: "BUTTON · “Place Order”",
      viewport: "390 × 844 @3x",
      browser: "iPhone · en-US",
      userAgent: "Mozilla/5.0 (iPhone)",
    });
  });

  it("still reads an older browser string", () => {
    expect(
      readIssueContext({ viewport: { width: 1280, height: 800, devicePixelRatio: 1 }, browser: "Safari 18" }),
    ).toEqual({ ...EMPTY, viewport: "1280 × 800", browser: "Safari 18" });
  });

  it("ignores missing or malformed values", () => {
    expect(readIssueContext(null)).toEqual(EMPTY);
    expect(readIssueContext(["x"])).toEqual(EMPTY);
    expect(readIssueContext({ viewport: null, element: null, browser: null })).toEqual(EMPTY);
    expect(
      readIssueContext({ selector: 42, viewport: { width: "wide" }, browser: ["x"], element: "x" }),
    ).toEqual(EMPTY);
  });
});

describe("reporterName", () => {
  it("names a member, a guest, or an anonymous guest", () => {
    expect(reporterName({ reporter: person, guest: null })).toBe("Rahul");
    expect(reporterName({ reporter: null, guest: { name: "Alice", email: "a@x.com" } })).toBe(
      "Alice (guest)",
    );
    expect(reporterName({ reporter: null, guest: { name: null, email: "a@x.com" } })).toBe(
      "a@x.com (guest)",
    );
    expect(reporterName({ reporter: null, guest: null })).toBe("Guest reviewer");
    expect(reporterName({ reporter: null })).toBe("Guest reviewer");
  });
});
