import type { Metadata } from "next";
import { CenteredShell } from "@/components/app/centered-shell";
import { ReviewContent } from "./review-content";

export const metadata: Metadata = {
  title: "Open your review",
  description: "Opening the website you were invited to review.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReviewPage() {
  return (
    <CenteredShell>
      <ReviewContent />
    </CenteredShell>
  );
}
