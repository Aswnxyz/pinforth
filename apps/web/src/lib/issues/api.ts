import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * The issue API client.
 *
 * The only place in the frontend that talks to the issue endpoints. It reuses
 * `apiFetch`, so credentials, the single 401 → refresh → retry flow and
 * network-error normalisation are inherited.
 *
 * Requests address the organization by its backend **id** and the project by
 * its slug, exactly like the project client. Issues are addressed by their
 * per-project `number`, which is what the URL shows.
 *
 * shortcut: these types are the agreed issue contract, written before the
 * backend exists. The backend PR must return exactly these shapes.
 */

export const ISSUE_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "READY_FOR_VERIFICATION",
  "CLOSED",
] as const;
export const ISSUE_TYPES = ["BUG", "DESIGN", "CONTENT", "SUGGESTION"] as const;
export const ISSUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const ISSUE_SOURCES = ["DASHBOARD", "WIDGET"] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
export type IssueSource = (typeof ISSUE_SOURCES)[number];

/** A user as an issue shows them. `id` is the user's account id. */
export interface IssuePerson {
  id: string;
  name: string;
  email: string;
}

export interface Issue {
  id: string;
  /** Per-project, never reused: `#12`. */
  number: number;
  title: string;
  description: string | null;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  source: IssueSource;
  /** Null once a guest reviewer (no account) can report issues. */
  reporter: IssuePerson | null;
  assignee: IssuePerson | null;
  environment: { id: string; name: string } | null;
  /** Filled by the feedback widget; null for dashboard issues. */
  pageUrl: string | null;
  /** Widget-captured page context (selector, viewport, browser). */
  context: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type IssueCounts = Record<IssueStatus, number>;

export interface IssuePage {
  issues: Issue[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Per-status totals for the other active filters, for the tabs. */
  counts: IssueCounts;
}

/**
 * List filters. `assignee` is a user id, `"me"` for the caller, or `"none"`
 * for unassigned issues.
 */
export interface IssueFilters {
  status: IssueStatus | null;
  priority: IssuePriority | null;
  type: IssueType | null;
  assignee: string | null;
}

export type IssueField =
  | "title"
  | "description"
  | "type"
  | "priority"
  | "status"
  | "assigneeId"
  | "environmentId";

export type IssueFieldErrors = Partial<Record<IssueField, string>>;

export interface CreateIssueInput {
  title: string;
  description?: string;
  type: IssueType;
  priority: IssuePriority;
  /** The assignee's user id (not their membership id). */
  assigneeId?: string;
  environmentId?: string;
}

/** Omitted leaves a field unchanged; `null` clears it. */
export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  type?: IssueType;
  priority?: IssuePriority;
  status?: IssueStatus;
  assigneeId?: string | null;
  environmentId?: string | null;
}

export interface IssueRemoval {
  issueId: string;
}

/**
 * The outcome of an issue request.
 *
 * `unauthorized` means the session is over; `unavailable` covers outages,
 * network failures and unreadable responses, so a mutation that ends there
 * may or may not have happened. `not-found` covers missing and inaccessible
 * alike, like the API.
 */
export type IssueApiOutcome<Data> =
  | { status: "success"; data: Data }
  | { status: "rejected"; message: string; fields?: IssueFieldErrors }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "not-found" }
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string };

const MALFORMED_MESSAGE =
  "Pinforth received an unexpected response. Please refresh and try again.";

const ISSUE_FIELDS: readonly IssueField[] = [
  "title",
  "description",
  "type",
  "priority",
  "status",
  "assigneeId",
  "environmentId",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value);

const isStatus = oneOf(ISSUE_STATUSES);
const isType = oneOf(ISSUE_TYPES);
const isPriority = oneOf(ISSUE_PRIORITIES);
const isSource = oneOf(ISSUE_SOURCES);

function isPerson(value: unknown): value is IssuePerson {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.email)
  );
}

/** A 200 with a missing or wrongly typed field is malformed, not a success. */
export function isIssue(value: unknown): value is Issue {
  return (
    isRecord(value) &&
    isString(value.id) &&
    Number.isInteger(value.number) &&
    isString(value.title) &&
    (value.description === null || isString(value.description)) &&
    isType(value.type) &&
    isPriority(value.priority) &&
    isStatus(value.status) &&
    isSource(value.source) &&
    (value.reporter === null || isPerson(value.reporter)) &&
    (value.assignee === null || isPerson(value.assignee)) &&
    (value.environment === null ||
      (isRecord(value.environment) &&
        isString(value.environment.id) &&
        isString(value.environment.name))) &&
    (value.pageUrl === null || isString(value.pageUrl)) &&
    (value.context === null || isRecord(value.context)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isCounts(value: unknown): value is IssueCounts {
  return (
    isRecord(value) &&
    ISSUE_STATUSES.every((status) => Number.isInteger(value[status]))
  );
}

function isIssuePage(value: unknown): value is IssuePage {
  return (
    isRecord(value) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    (value.nextCursor === null || isString(value.nextCursor)) &&
    isCounts(value.counts)
  );
}

function isIssueRemoval(value: unknown): value is IssueRemoval {
  return isRecord(value) && isString(value.issueId);
}

function fieldErrorsFrom(details: unknown): IssueFieldErrors | undefined {
  if (!Array.isArray(details)) return undefined;

  const fields: IssueFieldErrors = {};

  for (const detail of details) {
    if (!isRecord(detail) || !isString(detail.path) || !isString(detail.message)) {
      continue;
    }
    if ((ISSUE_FIELDS as readonly string[]).includes(detail.path)) {
      fields[detail.path as IssueField] ??= detail.message;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function mapIssueOutcome<Data>(
  res: ApiResult<unknown>,
  pick: (data: unknown) => unknown,
  isData: (value: unknown) => value is Data,
): IssueApiOutcome<Data> {
  if (res.ok) {
    const data = pick(res.data);

    if (!isData(data)) {
      return { status: "unavailable", message: MALFORMED_MESSAGE };
    }

    return { status: "success", data };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", message: res.message };
  if (res.status === 404) return { status: "not-found" };
  if (res.status === 409) return { status: "conflict", message: res.message };

  // Status 0 is a network failure and 5xx an outage: either way the request
  // may or may not have landed, so it is never treated as a rejection.
  if (res.status === 0 || res.status >= 500) {
    return { status: "unavailable", message: res.message };
  }

  const fields = fieldErrorsFrom(res.details);

  return { status: "rejected", message: res.message, ...(fields ? { fields } : {}) };
}

const pickField = (key: string) => (data: unknown) =>
  isRecord(data) ? data[key] : undefined;

const issuesPath = (orgId: string, projectSlug: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectSlug)}/issues`;

const issuePath = (orgId: string, projectSlug: string, number: number) =>
  `${issuesPath(orgId, projectSlug)}/${encodeURIComponent(String(number))}`;

/** Builds the list query; unset filters are left out entirely. */
export function issueListQuery(
  filters: IssueFilters,
  cursor: string | null = null,
): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.type) params.set("type", filters.type);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (cursor) params.set("cursor", cursor);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listIssues(
  orgId: string,
  projectSlug: string,
  filters: IssueFilters,
  cursor: string | null = null,
): Promise<IssueApiOutcome<IssuePage>> {
  const res = await apiFetch<unknown>(
    `${issuesPath(orgId, projectSlug)}${issueListQuery(filters, cursor)}`,
    { method: "GET" },
  );

  return mapIssueOutcome(res, (data) => data, isIssuePage);
}

export async function getIssue(
  orgId: string,
  projectSlug: string,
  number: number,
): Promise<IssueApiOutcome<Issue>> {
  const res = await apiFetch<unknown>(issuePath(orgId, projectSlug, number), {
    method: "GET",
  });

  return mapIssueOutcome(res, pickField("issue"), isIssue);
}

export async function createIssue(
  orgId: string,
  projectSlug: string,
  input: CreateIssueInput,
): Promise<IssueApiOutcome<Issue>> {
  const res = await apiFetch<unknown>(issuesPath(orgId, projectSlug), {
    method: "POST",
    body: JSON.stringify(input),
  });

  return mapIssueOutcome(res, pickField("issue"), isIssue);
}

export async function updateIssue(
  orgId: string,
  projectSlug: string,
  number: number,
  input: UpdateIssueInput,
): Promise<IssueApiOutcome<Issue>> {
  const res = await apiFetch<unknown>(issuePath(orgId, projectSlug, number), {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return mapIssueOutcome(res, pickField("issue"), isIssue);
}

export async function deleteIssue(
  orgId: string,
  projectSlug: string,
  number: number,
): Promise<IssueApiOutcome<IssueRemoval>> {
  const res = await apiFetch<unknown>(issuePath(orgId, projectSlug, number), {
    method: "DELETE",
  });

  return mapIssueOutcome(res, (data) => data, isIssueRemoval);
}
