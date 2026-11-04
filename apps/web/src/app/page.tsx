import { Bricolage_Grotesque } from "next/font/google";
import { ClosingSection, LandingFooter } from "@/components/landing/closing-section";
import { HeroStage } from "@/components/landing/hero-stage";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { ProblemSection } from "@/components/landing/problem-section";
import { ProductSection } from "@/components/landing/product-section";
import { WorkflowSection } from "@/components/landing/workflow-section";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-display",
  display: "swap",
});

/**
 * The marketing homepage (Landing Page V2).
 *
 * A server component: only the auth-aware islands (nav, hero copy) are
 * client components. The `.landing` wrapper scopes the light Studio Table
 * theme — the app screens outside this subtree are unaffected.
 */
export default function HomePage() {
  return (
    <div
      className={`landing ${display.variable} min-h-dvh overflow-x-clip bg-surface text-foreground`}
    >
      <LandingNav />

      <main>
        <section className="lp-hero" aria-labelledby="hero-heading">
          <div className="lp-container lp-hero-grid">
            <LandingHero />
            <HeroStage />
          </div>
        </section>

        <ProblemSection />
        <WorkflowSection />
        <ProductSection />
        <ClosingSection />
      </main>

      <LandingFooter />
    </div>
  );
}
