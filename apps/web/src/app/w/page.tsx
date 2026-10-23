"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { OrganizationRoleBadge } from "@/components/workspace/organization-role-badge";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import type { OrganizationSummary } from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import { resolveWorkspaceDestination } from "@/lib/organizations/workspace-destination";

export default function WorkspaceIndexPage() {
  return (
    <WorkspaceGate>
      <WorkspaceChooser />
    </WorkspaceGate>
  );
}

function WorkspaceChooser() {
  const router = useRouter();
  const { organizations } = useWorkspaces();

  const destination = resolveWorkspaceDestination(organizations);
  // Primitives, so the redirect effect does not re-run on every render.
  const kind = destination.kind;
  const slug = destination.kind === "workspace" ? destination.slug : null;

  useEffect(() => {
    if (kind === "onboarding") {
      router.replace("/onboarding");
      return;
    }

    if (kind === "workspace" && slug) {
      router.replace(`/w/${slug}`);
    }
  }, [kind, slug, router]);

  if (kind !== "chooser") {
    return <WorkspaceLoading />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-xl space-y-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Choose a workspace
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              You belong to more than one workspace. Pick the one you want to
              work in.
            </p>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xs">
            {organizations.map((organization) => (
              <li key={organization.id}>
                <OrganizationLink organization={organization} />
              </li>
            ))}
          </ul>

          <Link
            href="/onboarding"
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Create another workspace
          </Link>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

function OrganizationLink({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <Link
      href={`/w/${organization.slug}`}
      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {organization.name}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          /w/{organization.slug}
        </span>
      </span>
      <OrganizationRoleBadge role={organization.role} />
    </Link>
  );
}
