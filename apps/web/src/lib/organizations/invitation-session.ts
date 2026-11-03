
const STORAGE_KEY = "pinforth:pending-invitation";

export function getStoredInvitationToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeInvitationToken(token: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearInvitationToken(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be disabled.
  }
}

export function destinationAfterAuth(fallback: string): string {
  return getStoredInvitationToken() ? "/invite" : fallback;
}
