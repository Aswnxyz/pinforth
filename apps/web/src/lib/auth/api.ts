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
 */
export const POST_AUTH_REDIRECT = "/account";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Single in-flight refresh coordinator to prevent race conditions during
 * rotating refresh token exchange.
 */
export async function refreshSession(): Promise<boolean> {
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
      return res.ok;
    } catch {
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

interface ApiFetchOptions extends RequestInit {
  retryOn401?: boolean;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
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
      if (refreshed) {
        return apiFetch<T>(path, { ...options, retryOn401: false });
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
      message: "Unable to connect to the server. Please check your connection and try again.",
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

  if (res.code === "VALIDATION_ERROR" && res.details) {
    const fields: Partial<Record<AuthField, string>> = {};
    for (const d of res.details) {
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

  if (res.code === "VALIDATION_ERROR" && res.details) {
    const fields: Partial<Record<AuthField, string>> = {};
    for (const d of res.details) {
      if (d.path === "name" || d.path === "email" || d.path === "password") {
        fields[d.path as AuthField] = d.message;
      }
    }
    return { status: "rejected", message: res.message, fields };
  }

  return { status: "rejected", message: res.message };
}

export async function getCurrentUser(): Promise<{
  user: AuthUser;
  memberships: AuthMembership[];
} | null> {
  const res = await apiFetch<{
    user: AuthUser;
    memberships: AuthMembership[];
  }>("/api/v1/auth/me", {
    method: "GET",
  });

  if (res.ok && res.data?.user) {
    return res.data;
  }

  return null;
}

export async function signOut(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
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
