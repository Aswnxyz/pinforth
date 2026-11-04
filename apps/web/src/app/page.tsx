import { Instrument_Serif } from "next/font/google";
import { FoliageCluster } from "@/components/landing/art/icons";
import { HeroStage } from "@/components/landing/hero-stage";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingNav } from "@/components/landing/landing-nav";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

/**
 * The marketing homepage (Landing Page V2).
 *
 * A server component: only the auth-aware islands (nav, hero copy) are
 * client components. The `.landing` wrapper scopes the dark theme — the
 * light app screens outside this subtree are unaffected.
 */
export default function HomePage() {
  return (
    <div
      className={`landing ${display.variable} min-h-dvh overflow-x-clip bg-surface text-foreground`}
    >
      <div className="lp-top-glow" aria-hidden="true" />
      <FoliageCluster className="pointer-events-none absolute -left-5 -top-4 z-20 w-32 sm:w-44 lg:w-56" />

      <LandingNav />

      <main>
        <section className="mx-auto w-full max-w-[84rem] px-5 pt-6 sm:px-8 lg:pt-10">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10">
            <LandingHero />
            <HeroStage />
          </div>
        </section>
      </main>
    </div>
  );
}
