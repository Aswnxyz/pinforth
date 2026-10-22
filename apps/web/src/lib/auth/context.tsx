"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUser,
  signOut as apiSignOut,
  type AuthMembership,
  type AuthUser,
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  memberships: AuthMembership[];
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await getCurrentUser();
      if (data) {
        setUser(data.user);
        setMemberships(data.memberships);
      } else {
        setUser(null);
        setMemberships([]);
      }
    } catch {
      setUser(null);
      setMemberships([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    getCurrentUser()
      .then((data) => {
        if (ignore) return;
        if (data) {
          setUser(data.user);
          setMemberships(data.memberships);
        } else {
          setUser(null);
          setMemberships([]);
        }
      })
      .catch(() => {
        if (ignore) return;
        setUser(null);
        setMemberships([]);
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    setMemberships([]);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        isLoading,
        isAuthenticated: Boolean(user),
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
