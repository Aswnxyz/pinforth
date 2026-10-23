"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/context";
import {
  listOrganizations,
  type OrganizationsOutcome,
  type OrganizationSummary,
} from "./api";
import type { WorkspaceStatus } from "./workspace-destination";

export type { WorkspaceStatus };

interface WorkspacesContextValue {
  organizations: OrganizationSummary[];
  status: WorkspaceStatus;
  errorMessage: string | null;
  /** Reloads the list, for example after a recoverable failure. */
  refresh: () => Promise<void>;
}

const WorkspacesContext = createContext<WorkspacesContextValue | undefined>(
  undefined,
);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only the newest request may write state, so a slow response that arrives
  // after a newer one cannot overwrite it.
  const requestId = useRef(0);

  const applyOutcome = useCallback((outcome: OrganizationsOutcome) => {
    if (outcome.status === "success") {
      setOrganizations(outcome.organizations);
      setStatus("ready");
      return;
    }

    setOrganizations([]);

    if (outcome.status === "unauthorized") {
      setStatus("unauthorized");
      return;
    }

    setStatus("error");
    setErrorMessage(outcome.message);
  }, []);

  useEffect(() => {
    // The list is only fetched for a confirmed session. While the session is
    // unresolved, or the service is unreachable, nothing is requested.
    if (authStatus !== "authenticated") return;

    // shortcut: a membership change made elsewhere is only noticed on the next
    // list fetch (a remount or a refresh); add polling or invalidation when
    // memberships must update live.

    const request = ++requestId.current;

    listOrganizations().then((outcome) => {
      // A newer request has happened; this result is stale.
      if (request !== requestId.current) return;

      applyOutcome(outcome);
    });
  }, [authStatus, applyOutcome]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);

    const request = ++requestId.current;
    const outcome = await listOrganizations();

    if (request !== requestId.current) return;

    applyOutcome(outcome);
  }, [applyOutcome]);

  // The list belongs to the session that was confirmed when it was loaded, so
  // it is only exposed while that session is still confirmed.
  const resolvedStatus: WorkspaceStatus =
    authStatus === "unauthenticated"
      ? "unauthorized"
      : authStatus === "authenticated"
        ? status
        : "loading";

  const value = useMemo<WorkspacesContextValue>(
    () => ({
      organizations: resolvedStatus === "ready" ? organizations : [],
      status: resolvedStatus,
      errorMessage,
      refresh,
    }),
    [organizations, resolvedStatus, errorMessage, refresh],
  );

  return (
    <WorkspacesContext.Provider value={value}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces(): WorkspacesContextValue {
  const context = useContext(WorkspacesContext);

  if (!context) {
    throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  }

  return context;
}
