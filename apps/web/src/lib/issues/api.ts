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
 * Mirrors `packages/shared/src/issues.ts` and `apps/api/src/modules/issues`.
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

/** A person as an issue shows them. `name` is optional on an account. */
export interface IssuePerson {
  /** The reporter's user id, but the assignee's **membership** id. */
  id: string;
  name: string | null;
  email: string;
}

/** What a list row carries. */
export interface IssueSummary {
  id: string;
  /** Per-project, never reused: `#12`. */
  number: number;
  title: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  source: IssueSource;
  /** Null when a guest reviewer (no account) reported it; see `guest`. */
  reporter: IssuePerson | null;
  /** The guest reviewer who reported it through the widget. */
  guest?: IssueGuest | null;
  /** The review round a widget issue was reported in. */
  reviewRound?: { id: string; name: string } | null;
  assignee: IssuePerson | null;
  environment: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Both are optional on a guest link; either may be missing. */
export interface IssueGuest {
  name: string | null;
  email: string | null;
}

/** The full issue, as the single-issue endpoints return it. */
export interface Issue extends IssueSummary {
  description: string | null;
  /** Filled by the feedback widget; null for dashboard issues. */
  pageUrl: string | null;
  /** Widget-captured page context (selector, viewport, browser); free-form JSON. */
  context: unknown;
}

/** Per-status totals for the other active filters, plus `all`, for the tabs. */
export type IssueCounts = Record<IssueStatus | "all", number>;

export interface IssuePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface IssuePage {
  issues: IssueSummary[];
  pagination: IssuePagination;
  counts: IssueCounts;
}

/**
 * List filters. `assignee` is a membership id, `"me"` for the caller, or
 * `"unassigned"`.
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
  /** The assignee's membership id (not their user id). */
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
  deleted: true;
  number: number;
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
    (value.name === null || isString(value.name)) &&
    isString(value.email)
  );
}

/** A 200 with a missing or wrongly typed field is malformed, not a success. */
export function isIssueSummary(value: unknown): value is IssueSummary {
  return (
    isRecord(value) &&
    isString(value.id) &&
    Number.isInteger(value.number) &&
    isString(value.title) &&
    isType(value.type) &&
    isPriority(value.priority) &&
    isStatus(value.status) &&
    isSource(value.source) &&
    (value.reporter === null || isPerson(value.reporter)) &&
    (value.guest == null ||
      (isRecord(value.guest) &&
        (value.guest.name === null || isString(value.guest.name)) &&
        (value.guest.email === null || isString(value.guest.email)))) &&
    (value.reviewRound == null ||
      (isRecord(value.reviewRound) &&
        isString(value.reviewRound.id) &&
        isString(value.reviewRound.name))) &&
    (value.assignee === null || isPerson(value.assignee)) &&
    (value.environment === null ||
      (isRecord(value.environment) &&
        isString(value.environment.id) &&
        isString(value.environment.name))) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isIssue(value: unknown): value is Issue {
  return (
    isIssueSummary(value) &&
    isRecord(value) &&
    (value.description === null || isString(value.description)) &&
    (value.pageUrl === null || isString(value.pageUrl)) &&
    // Free-form JSON: any value is valid, it is read defensively when shown.
    "context" in value
  );
}

const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function isCounts(value: unknown): value is IssueCounts {
  return (
    isRecord(value) &&
    isCount(value.all) &&
    ISSUE_STATUSES.every((status) => isCount(value[status]))
  );
}

function isPagination(value: unknown): value is IssuePagination {
  return (
    isRecord(value) &&
    [value.page, value.limit, value.total, value.totalPages].every(isCount) &&
    (value.page as number) >= 1
  );
}

function isIssuePage(value: unknown): value is IssuePage {
  return (
    isRecord(value) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssueSummary) &&
    isPagination(value.pagination) &&
    isCounts(value.counts)
  );
}

function isIssueRemoval(value: unknown): value is IssueRemoval {
  return isRecord(value) && value.deleted === true && Number.isInteger(value.number);
}

/** Whether a later page exists after this one. */
export const hasNextPage = (page: IssuePage) =>
  page.pagination.page < page.pagination.totalPages;

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

/**
 * Builds the list query; unset filters and page 1 are left out entirely.
 * The API rejects unknown query keys, so only its names are used.
 */
export function issueListQuery(filters: IssueFilters, page = 1): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.type) params.set("type", filters.type);
  if (filters.assignee) params.set("assigneeId", filters.assignee);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listIssues(
  orgId: string,
  projectSlug: string,
  filters: IssueFilters,
  page = 1,
): Promise<IssueApiOutcome<IssuePage>> {
  const res = await apiFetch<unknown>(
    `${issuesPath(orgId, projectSlug)}${issueListQuery(filters, page)}`,
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
