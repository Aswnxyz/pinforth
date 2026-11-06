/**
 * The reviewer's widget session, kept in `sessionStorage` for this tab.
 *
 * The token only works for one review round, from this website's origin, for
 * a few hours; the website's own scripts can read it, which is acceptable for
 * that scope. Storage can be unavailable (private mode, blocked site data),
 * so every access is guarded and the widget then lives for this page only.
 */

export interface WidgetSession {
  token: string;
  expiresAt: string;
  projectName: string;
  environment: { name: string; url: string };
  roundName: string;
  reviewer: { name: string | null; email: string | null };
}

const STORAGE_KEY = "pinforth:widget-session";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown) => value === null || typeof value === "string";

export function isWidgetSession(value: unknown): value is WidgetSession {
  return (
    isRecord(value) &&
    typeof value.token === "string" &&
    value.token.startsWith("pf_ws_") &&
    typeof value.expiresAt === "string" &&
    !Number.isNaN(Date.parse(value.expiresAt)) &&
    typeof value.projectName === "string" &&
    isRecord(value.environment) &&
    typeof value.environment.name === "string" &&
    typeof value.environment.url === "string" &&
    typeof value.roundName === "string" &&
    isRecord(value.reviewer) &&
    isNullableString(value.reviewer.name) &&
    isNullableString(value.reviewer.email)
  );
}

export function sessionExpired(session: WidgetSession, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) <= now;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSession(now = Date.now()): WidgetSession | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isWidgetSession(parsed) || sessionExpired(parsed, now)) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: WidgetSession): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Kept in memory only; the review still works until the page reloads.
  }
}

export function clearSession(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Whether the session belongs to the website the widget is running on. */
export function sessionMatchesOrigin(session: WidgetSession, origin: string): boolean {
  try {
    return new URL(session.environment.url).origin === origin;
  } catch {
    return false;
  }
}
