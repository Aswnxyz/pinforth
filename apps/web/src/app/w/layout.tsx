"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import { WorkspaceProvider } from "@/lib/organizations/context";

/**
 * The `/w` route boundary.
 *
 * It only provides the workspace list. The pages decide what to show, so the
 * route segments are always rendered and never dropped from the tree.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();

  return (
    // A different account starts from an empty list, so one user's workspaces
    // are never carried over to another.
    <WorkspaceProvider key={user?.id ?? "signed-out"}>
      {children}
    </WorkspaceProvider>
  );
}
