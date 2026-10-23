import type { AuthMembership, AuthUser } from "@pinforth/shared";
import {
  fieldErrorsFrom,
  loginSchema,
  registerSchema,
  type AuthField,
  type LoginValues,
  type RegisterValues,
} from "./validation";

export type { AuthField, AuthMembership, AuthUser };

export type AuthOutcome =
  | { status: "success"; user?: AuthUser }
  | { status: "rejected"; message: string; fields?: Partial<Record<AuthField, string>> }
  | { status: "unavailable"; message: string };

/**
 * Where a signed-in user lands.
 *
 * The workspace entry point decides what happens next: onboarding for a new
 * user, the only workspace when there is one, or the chooser when there are
 * several.
 */
export const POST_AUTH_REDIRECT = "/w";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** The message shown whenever the API could not be reached at all. */
const NETWORK_ERROR_MESSAGE =
  "Unable to connect to the server. Please check your connection and try again.";

/**
 * The result of trying to exchange the refresh token.
 *
 * `rejected` means the session is genuinely over. `unavailable` means the
 * service could not be reached, which says nothing about the session: the
 * refresh token may still be perfectly valid.
 */
export type RefreshOutcome = "refreshed" | "rejected" | "unavailable";

let inFlightRefresh: Promise<RefreshOutcome> | null = null;

/**
 * Single in-flight refresh coordinator to prevent race conditions during
 * rotating refresh token exchange.
 */
export async function refreshSession(): Promise<RefreshOutcome> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) return "refreshed";

      // Only an authorization answer proves the session is over. A rate limit
      // or a server error says nothing about it, so the user is not signed out
      // for those.
      return res.status === 401 || res.status === 403
        ? "rejected"
        : "unavailable";
    } catch {
      return "unavailable";
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

interface ApiFetchOptions extends RequestInit {
  retryOn401?: boolean;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message: string;
  /**
   * Error details. Schema failures send an array of `{ path, message }`, but
   * other bad requests send a single `{ field }` object, so callers narrow
   * this themselves rather than trusting one shape.
   */
  details?: unknown;
}

/**
 * Lightweight, typed credentialed fetch client.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const { retryOn401 = true, headers, ...rest } = options;
  const url = `${API_BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });

    if (res.status === 401 && retryOn401) {
      const refreshed = await refreshSession();

      if (refreshed === "refreshed") {
        return apiFetch<T>(path, { ...options, retryOn401: false });
      }

      if (refreshed === "unavailable") {
        // The service could not be reached, so the 401 says nothing about the
        // session. Report it as a network failure instead, so callers do not
        // treat a temporary outage as a revoked session.
        return {
          ok: false,
          status: 0,
          code: "NETWORK_ERROR",
          message: NETWORK_ERROR_MESSAGE,
        };
      }
    }

    const json = await res.json().catch(() => null);

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        data: (json?.data ?? json) as T,
        message: json?.message ?? "Success",
      };
    }

    return {
      ok: false,
      status: res.status,
      code: json?.code,
      message: json?.message ?? "An error occurred",
      details: json?.details,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: NETWORK_ERROR_MESSAGE,
    };
  }
}

export async function signInWithPassword(
  values: LoginValues,
): Promise<AuthOutcome> {
  const result = loginSchema.safeParse(values);

  if (!result.success) {
    return {
      status: "rejected",
      message: "Some of the details you entered need attention.",
      fields: fieldErrorsFrom(result.error.issues),
    };
  }

  const res = await apiFetch<{ user: AuthUser }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(result.data),
    retryOn401: false,
  });

  if (res.ok && res.data?.user) {
    return { status: "success", user: res.data.user };
  }

  if (res.code === "NETWORK_ERROR" || res.status === 0) {
    return { status: "unavailable", message: res.message };
  }

  if (res.code === "INVALID_CREDENTIALS" || res.status === 401) {
    return { status: "rejected", message: "Email or password is incorrect." };
  }

  if (res.status === 429) {
    return {
      status: "rejected",
      message: "Too many sign-in attempts. Please try again in a few minutes.",
    };
  }

  if (res.code === "VALIDATION_ERROR" && Array.isArray(res.details)) {
    const details = res.details as Array<{ path: string; message: string }>;
    const fields: Partial<Record<AuthField, string>> = {};
    for (const d of details) {
      if (d.path === "email" || d.path === "password") {
        fields[d.path] = d.message;
      }
    }
    return { status: "rejected", message: res.message, fields };
  }

  return { status: "rejected", message: res.message };
}

export async function registerWithPassword(
  values: RegisterValues,
): Promise<AuthOutcome> {
  const result = registerSchema.safeParse(values);

  if (!result.success) {
    return {
      status: "rejected",
      message: "Please check your registration details.",
      fields: fieldErrorsFrom(result.error.issues),
    };
  }

  const res = await apiFetch<{ user: AuthUser }>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(result.data),
    retryOn401: false,
  });

  if (res.ok && res.data?.user) {
    return { status: "success", user: res.data.user };
  }

  if (res.code === "NETWORK_ERROR" || res.status === 0) {
    return { status: "unavailable", message: res.message };
  }

  if (res.code === "EMAIL_ALREADY_EXISTS" || res.status === 409) {
    return {
      status: "rejected",
      message: res.message,
      fields: { email: res.message },
    };
  }

  if (res.status === 429) {
    return {
      status: "rejected",
      message: "Too many attempts. Please try again in a few minutes.",
    };
  }

  if (res.code === "VALIDATION_ERROR" && Array.isArray(res.details)) {
    const details = res.details as Array<{ path: string; message: string }>;
    const fields: Partial<Record<AuthField, string>> = {};
    for (const d of details) {
      if (d.path === "name" || d.path === "email" || d.path === "password") {
        fields[d.path as AuthField] = d.message;
      }
    }
    return { status: "rejected", message: res.message, fields };
  }

  return { status: "rejected", message: res.message };
}

/**
 * The result of checking the current session.
 *
 * `unauthenticated` is only used when the API itself refused the session.
 * `unavailable` means the check could not be completed, which says nothing
 * about whether the user is signed in.
 */
export type CurrentUserOutcome =
  | { status: "authenticated"; user: AuthUser; memberships: AuthMembership[] }
  | { status: "unauthenticated" }
  | { status: "unavailable"; message: string };

type CurrentUserResponse = {
  user: AuthUser;
  memberships: AuthMembership[];
};

/**
 * Maps the `/auth/me` response to a session outcome.
 *
 * A confirmed 401 is the only evidence that the session is over. Every other
 * failure — the service being down, unreachable or answering with something
 * unexpected — leaves the session unknown.
 */
export function mapCurrentUserOutcome(
  res: ApiResult<CurrentUserResponse>,
): CurrentUserOutcome {
  if (res.ok && res.data?.user) {
    return {
      status: "authenticated",
      user: res.data.user,
      memberships: res.data.memberships ?? [],
    };
  }

  if (res.status === 401) {
    return { status: "unauthenticated" };
  }

  return { status: "unavailable", message: res.message };
}

export async function getCurrentUser(): Promise<CurrentUserOutcome> {
  const res = await apiFetch<CurrentUserResponse>("/api/v1/auth/me", {
    method: "GET",
  });

  return mapCurrentUserOutcome(res);
}

/**
 * The result of asking the server to end the session.
 *
 * Only a confirmed response proves that the session was revoked and the
 * cookies cleared. Anything else leaves the session possibly alive, so the
 * frontend must not pretend otherwise.
 */
export type SignOutOutcome =
  | { status: "signed-out" }
  | { status: "unavailable"; message: string };

export async function signOut(): Promise<SignOutOutcome> {
  const res = await apiFetch<null>("/api/v1/auth/logout", {
    method: "POST",
    // The route does not need a valid access token, and refreshing one on the
    // way out would only prolong the session.
    retryOn401: false,
  });

  if (res.ok) {
    return { status: "signed-out" };
  }

  return {
    status: "unavailable",
    message:
      "We could not confirm your sign-out, so your session may still be active.",
  };
}

export async function verifyEmail(
  token: string,
): Promise<{ success: boolean; message: string; code?: string }> {
  const res = await apiFetch<{ emailVerifiedAt: string }>(
    "/api/v1/auth/verify-email",
    {
      method: "POST",
      body: JSON.stringify({ token }),
      retryOn401: false,
    },
  );

  if (res.ok) {
    return {
      success: true,
      message: "Your email has been verified successfully.",
    };
  }

  return {
    success: false,
    message: res.message,
    code: res.code,
  };
}

export async function resendVerification(): Promise<{
  success: boolean;
  message: string;
  alreadyVerified?: boolean;
}> {
  const res = await apiFetch<{ alreadyVerified: boolean }>(
    "/api/v1/auth/resend-verification",
    {
      method: "POST",
    },
  );

  if (res.ok && res.data) {
    return {
      success: true,
      message: res.data.alreadyVerified
        ? "Your email is already confirmed."
        : "A new confirmation email has been sent. Please check your inbox.",
      alreadyVerified: res.data.alreadyVerified,
    };
  }

  return {
    success: false,
    message: res.message,
  };
}
