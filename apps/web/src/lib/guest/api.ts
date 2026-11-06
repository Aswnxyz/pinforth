import { apiFetch } from "@/lib/auth/api";
import { safeWebsiteUrl } from "@/lib/projects/urls";

/**
 * The guest side of a review: a reviewer without an account swaps the secret
 * from their invitation link for a one-time code that the feedback widget on
 * the website exchanges in turn. Mirrors `apps/api/src/modules/guest`.
 */

export interface GuestHandoff {
  /** The website with `#pf_handoff=…`; the only place we send the guest. */
  stagingUrl: string;
  reviewRound: { id: string; name: string };
  reviewer: { name: string | null; email: string | null };
}

export type GuestExchangeOutcome =
  | { status: "success"; data: GuestHandoff }
  /** Unknown, expired or revoked: the link itself no longer works. */
  | { status: "denied"; message: string }
  /** The review round was closed or archived. */
  | { status: "closed"; message: string }
  | { status: "rate-limited"; message: string }
  | { status: "unavailable"; message: string };

const MALFORMED_MESSAGE =
  "Pinforth received an unexpected response. Please try again in a moment.";

/**
 * Reads the invitation secret from a URL fragment (`#token=pf_gr_…`).
 * Anything that isn't shaped like one is treated as absent.
 */
export function readInvitationToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token")?.trim();
  return token && /^pf_gr_[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown) => value === null || typeof value === "string";

/**
 * Only a normal web address carrying the handoff fragment is followed, so a
 * bad response can never send the guest to `javascript:` or another page.
 */
function readHandoff(data: unknown): GuestHandoff | null {
  if (!isRecord(data) || typeof data.stagingUrl !== "string") return null;

  const stagingUrl = safeWebsiteUrl(data.stagingUrl);
  if (!stagingUrl || !new URL(stagingUrl).hash.startsWith("#pf_handoff=")) return null;

  const round = data.reviewRound;
  const reviewer = data.reviewer;
  if (!isRecord(round) || typeof round.id !== "string" || typeof round.name !== "string") return null;
  if (!isRecord(reviewer) || !isNullableString(reviewer.name) || !isNullableString(reviewer.email)) {
    return null;
  }

  return {
    stagingUrl,
    reviewRound: { id: round.id, name: round.name },
    reviewer: { name: reviewer.name as string | null, email: reviewer.email as string | null },
  };
}

export async function exchangeGuestInvitation(token: string): Promise<GuestExchangeOutcome> {
  const res = await apiFetch<unknown>("/api/v1/guest/reviews/exchange", {
    method: "POST",
    body: JSON.stringify({ token }),
    // A 401 here is about the link, not a Pinforth session: never refresh.
    retryOn401: false,
  });

  if (res.ok) {
    const data = readHandoff(res.data);
    return data
      ? { status: "success", data }
      : { status: "unavailable", message: MALFORMED_MESSAGE };
  }

  if (res.status === 401 || res.status === 400 || res.status === 404) {
    return { status: "denied", message: res.message };
  }
  if (res.status === 403) return { status: "closed", message: res.message };
  if (res.status === 429) return { status: "rate-limited", message: res.message };
  return { status: "unavailable", message: res.message };
}
