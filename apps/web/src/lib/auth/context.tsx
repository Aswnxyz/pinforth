"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUser,
  signOut as apiSignOut,
  type AuthMembership,
  type AuthUser,
  type CurrentUserOutcome,
} from "./api";
import type { AuthStatus } from "./session";

export type { AuthStatus };

interface AuthContextValue {
  user: AuthUser | null;
  memberships: AuthMembership[];
  /** True while the session is still being checked. */
  isLoading: boolean;
  /** True only for a confirmed, valid session. */
  isAuthenticated: boolean;
  /** The state of the session, including a temporary outage. */
  status: AuthStatus;
  /** Why the session could not be checked, when it could not. */
  errorMessage: string | null;
  /** True while a sign-out request is in flight. */
  isSigningOut: boolean;
  /** Set when the last sign-out attempt could not be confirmed. */
  signOutError: string | null;
  /** Re-checks the session, and is also the retry for a temporary outage. */
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const applyOutcome = useCallback((outcome: CurrentUserOutcome) => {
    if (outcome.status === "authenticated") {
      setUser(outcome.user);
      setMemberships(outcome.memberships);
      setStatus("authenticated");
      setErrorMessage(null);
      return;
    }

    // A session that could not be confirmed is not a signed-out session, and
    // the previous user's details must not be shown as if they were still
    // valid.
    setUser(null);
    setMemberships([]);

    if (outcome.status === "unavailable") {
      setStatus("unavailable");
      setErrorMessage(outcome.message);
      return;
    }

    setStatus("unauthenticated");
    setErrorMessage(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      applyOutcome(await getCurrentUser());
    } catch {
      applyOutcome({
        status: "unavailable",
        message: "We could not check your session. Please try again.",
      });
    }
  }, [applyOutcome]);

  useEffect(() => {
    let ignore = false;

    getCurrentUser()
      .then((outcome) => {
        if (ignore) return;
        applyOutcome(outcome);
      })
      .catch(() => {
        if (ignore) return;
        applyOutcome({
          status: "unavailable",
          message: "We could not check your session. Please try again.",
        });
      });

    return () => {
      ignore = true;
    };
  }, [applyOutcome]);

  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const outcome = await apiSignOut();

      // The server may still hold a valid session, so the local state is only
      // cleared when the sign-out was actually confirmed.
      if (outcome.status === "unavailable") {
        setSignOutError(outcome.message);
        return;
      }

      setUser(null);
      setMemberships([]);
      setStatus("unauthenticated");
      setErrorMessage(null);
      router.push("/login");
    } finally {
      setIsSigningOut(false);
    }
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      memberships,
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      status,
      errorMessage,
      isSigningOut,
      signOutError,
      refreshUser,
      signOut,
    }),
    [
      user,
      memberships,
      status,
      errorMessage,
      isSigningOut,
      signOutError,
      refreshUser,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
