import type { WidgetSession } from "./session";

/**
 * The widget's API client. Mirrors `packages/shared/src/widget.ts` and
 * `apps/api/src/modules/widget` (docs/contracts/guest-feedback-v1.md §5).
 *
 * No cookies are ever sent: the session is a bearer token.
 */

export const ISSUE_TYPES = ["BUG", "DESIGN", "CONTENT", "SUGGESTION"] as const;
export const ISSUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export interface IssueContext {
  selector?: string;
  element?: {
    tagName: string;
    id?: string | null;
    classList?: string[];
    textContent?: string | null;
    xpath?: string | null;
    boundingBox?: { top: number; left: number; width: number; height: number };
  };
  viewport: { width: number; height: number; devicePixelRatio?: number };
  scroll?: { x: number; y: number };
  browser?: { userAgent?: string; language?: string; platform?: string };
  timestamp?: string;
}

export interface WidgetIssueInput {
  title: string;
  description?: string;
  type: IssueType;
  priority: IssuePriority;
  pageUrl: string;
  context: IssueContext;
  clientMutationId: string;
}

export type FieldName = "title" | "description" | "type" | "priority";

export type ExchangeOutcome =
  | { status: "success"; session: WidgetSession }
  /** Used, expired, revoked: the reviewer has to open their link again. */
  | { status: "denied"; message: string }
  | { status: "closed"; message: string }
  | { status: "unavailable"; message: string };

export type SubmitOutcome =
  | { status: "created"; number: number }
  /** The same report already arrived (a retried request). */
  | { status: "duplicate"; number: number }
  | { status: "rejected"; message: string; fields?: Partial<Record<FieldName, string>> }
  | { status: "ended"; message: string }
  | { status: "closed"; message: string }
  | { status: "conflict"; message: string }
  | { status: "rate-limited"; message: string }
  /** Unknown outcome: retrying with the same `clientMutationId` is safe. */
  | { status: "unavailable"; message: string };

const NETWORK_MESSAGE =
  "Pinforth couldn’t be reached. Check your connection — or this website may not be the address set up for the review.";
const MALFORMED_MESSAGE = "Pinforth sent an unexpected response. Please try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface Response_ {
  status: number;
  body: Record<string, unknown> | null;
}

async function post(url: string, body: unknown, token?: string): Promise<Response_ | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    return { status: res.status, body: isRecord(json) ? json : null };
  } catch {
    // Also what a wrong origin looks like: the API withholds the CORS header.
    return null;
  }
}

const messageOf = (res: Response_, fallback: string) =>
  typeof res.body?.message === "string" ? res.body.message : fallback;

export async function exchangeHandoff(apiBase: string, handoffCode: string): Promise<ExchangeOutcome> {
  const res = await post(`${apiBase}/api/v1/widget/sessions/exchange`, { handoffCode });
  if (!res) return { status: "unavailable", message: NETWORK_MESSAGE };

  if (res.status === 200) {
    const session = readSession(res.body?.data);
    return session ? { status: "success", session } : { status: "unavailable", message: MALFORMED_MESSAGE };
  }
  if (res.status === 401 || res.status === 400) {
    return { status: "denied", message: messageOf(res, "This review link has already been used.") };
  }
  if (res.status === 403) return { status: "closed", message: messageOf(res, "This review has ended.") };
  return { status: "unavailable", message: messageOf(res, NETWORK_MESSAGE) };
}

function readSession(data: unknown): WidgetSession | null {
  if (!isRecord(data)) return null;
  const { sessionToken, expiresAt, project, environment, reviewRound, reviewer } = data;
  if (
    typeof sessionToken !== "string" ||
    typeof expiresAt !== "string" ||
    !isRecord(project) ||
    typeof project.name !== "string" ||
    !isRecord(environment) ||
    typeof environment.name !== "string" ||
    typeof environment.url !== "string" ||
    !isRecord(reviewRound) ||
    typeof reviewRound.name !== "string" ||
    !isRecord(reviewer)
  ) {
    return null;
  }

  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    token: sessionToken,
    expiresAt,
    projectName: project.name,
    environment: { name: environment.name, url: environment.url },
    roundName: reviewRound.name,
    reviewer: { name: text(reviewer.name), email: text(reviewer.email) },
  };
}

const FIELDS: readonly FieldName[] = ["title", "description", "type", "priority"];

function fieldErrors(details: unknown): Partial<Record<FieldName, string>> | undefined {
  if (!Array.isArray(details)) return undefined;
  const errors: Partial<Record<FieldName, string>> = {};
  for (const detail of details) {
    if (!isRecord(detail) || typeof detail.path !== "string" || typeof detail.message !== "string") continue;
    if ((FIELDS as readonly string[]).includes(detail.path)) errors[detail.path as FieldName] ??= detail.message;
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

export async function submitIssue(
  apiBase: string,
  token: string,
  input: WidgetIssueInput,
): Promise<SubmitOutcome> {
  const res = await post(`${apiBase}/api/v1/widget/issues`, input, token);
  if (!res) return { status: "unavailable", message: NETWORK_MESSAGE };

  if (res.status === 200 || res.status === 201) {
    const data = res.body?.data;
    const number = isRecord(data) && isRecord(data.issue) ? data.issue.number : undefined;
    if (!Number.isInteger(number)) return { status: "unavailable", message: MALFORMED_MESSAGE };
    return { status: res.status === 201 ? "created" : "duplicate", number: number as number };
  }

  if (res.status === 401) {
    return { status: "ended", message: messageOf(res, "Your review session has ended.") };
  }
  if (res.status === 403) return { status: "closed", message: messageOf(res, "This review has ended.") };
  if (res.status === 409) return { status: "conflict", message: messageOf(res, "This report changed while sending.") };
  if (res.status === 429) {
    return { status: "rate-limited", message: "Too many reports in a short time. Please wait a few minutes." };
  }
  if (res.status === 400 || res.status === 413) {
    const fields = fieldErrors(res.body?.details);
    return {
      status: "rejected",
      message: messageOf(res, "Pinforth couldn’t accept this report."),
      ...(fields ? { fields } : {}),
    };
  }
  return { status: "unavailable", message: messageOf(res, NETWORK_MESSAGE) };
}
