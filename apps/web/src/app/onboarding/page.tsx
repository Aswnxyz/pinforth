import type { Metadata } from "next";
import { CenteredShell } from "@/components/app/centered-shell";
import { CreateOrganizationForm } from "@/components/workspace/create-organization-form";

export const metadata: Metadata = {
  title: "Create your workspace",
  description:
    "Create a Pinforth workspace for the client websites you review, track, and approve.",
};

export default function OnboardingPage() {
  return (
    <CenteredShell>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Create your workspace
      </h1>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        A workspace is where you keep the client websites you look after — the
        projects you review, the issues you fix, and the releases you approve.
        If you work on your own, use your own name or your business name.
      </p>

      <div className="mt-6">
        <CreateOrganizationForm />
      </div>
    </CenteredShell>
  );
}
