
import type { Metadata } from "next";
import { Suspense } from "react";
import { CenteredShell } from "@/components/app/centered-shell";
import { InvitationContent } from "./invitation-content";

export const metadata: Metadata = {
  title: "Join a workspace",
  description: "Review and accept your Pinforth invitation.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function InvitePage() {
  return (
    <CenteredShell>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Loading invitation...
          </p>
        }
      >
        <InvitationContent />
      </Suspense>
    </CenteredShell>
  );
}
