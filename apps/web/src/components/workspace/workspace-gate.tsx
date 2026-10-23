"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CenteredShell } from "@/components/app/centered-shell";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import {
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace/workspace-states";
import { useAuth } from "@/lib/auth/context";
import { useWorkspaces } from "@/lib/organizations/context";
import { resolveWorkspaceRouteState } from "@/lib/organizations/workspace-destination";

/**
 * The gate every `/w` page sits behind.
 *
 * It waits for the session, then for the workspace list, so a page only ever
 * sees a resolved list. A session the API refused sends the user to sign in;
 * a session that could not be checked offers a retry, because the user may
 * still be signed in; a workspace list that merely failed to load offers a
 * retry too, because the user is still signed in.
 */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const {
    status: authStatus,
    errorMessage: authErrorMessage,
    refreshUser,
  } = useAuth();
  const { status, errorMessage, refresh } = useWorkspaces();

  useEffect(() => {
    // A session the API refused. A session that could not be checked is not
    // treated as invalid.
    if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus, router]);

  useEffect(() => {
    // The session was refused by the organization API itself.
    if (status === "unauthorized") {
      router.replace("/login");
    }
  }, [status, router]);

  if (authStatus === "unavailable") {
    return (
      <CenteredShell>
        <SessionUnavailable
          message={authErrorMessage ?? "We could not reach Pinforth."}
          onRetry={() => void refreshUser()}
        />
      </CenteredShell>
    );
  }

  const routeState = resolveWorkspaceRouteState(status);

  // An unauthorized list is not an empty list: the pages must not see it, or
  // they would treat a failed session as "this user has no workspaces".
  if (authStatus === "loading" || routeState === "loading") {
    return <WorkspaceLoading />;
  }

  if (routeState === "error") {
    return (
      <CenteredShell>
        <WorkspaceError
          message={errorMessage ?? "Your workspaces could not be loaded."}
          onRetry={() => void refresh()}
        />
      </CenteredShell>
    );
  }

  return <>{children}</>;
}
