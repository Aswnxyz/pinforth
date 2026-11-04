"use client";

import type { CSSProperties } from "react";
import { useAuth } from "@/lib/auth/context";
import { HERO, primaryCtaAction } from "./landing-content";
import { PrimaryCta } from "./primary-cta";
import { ArrowDown } from "./art/icons";

const stagger = (ms: number) => ({ "--lp-delay": `${ms}ms` } as CSSProperties);

/**
 * The hero's text column — the only auth-aware part of the hero.
 *
 * The CTA resolves through `primaryCtaAction`, so the loading state renders
 * a same-geometry skeleton instead of an anonymous button that swaps text
 * once the session resolves. The headline is a staircase: each line steps
 * further in, and the last one carries the coral highlighter swipe.
 */
export function LandingHero() {
  const { isAuthenticated, isLoading } = useAuth();
  const action = primaryCtaAction(isAuthenticated, isLoading);

  return (
    <div className="lp-hero-copy">
      <p className="lp-eyebrow lp-enter" style={stagger(0)}>
        {HERO.eyebrow}
      </p>

      <h1
        id="hero-heading"
        className="lp-stair lp-enter mt-6 text-[clamp(2.05rem,4.2vw,3.75rem)]"
        style={stagger(80)}
      >
        {HERO.headlineLines.map((line) => (
          <span key={line} className="lp-stair-line">
            {line === HERO.headlineAccent ? (
              <span className="lp-mark">{line}</span>
            ) : (
              line
            )}
          </span>
        ))}
      </h1>

      <p className="lp-hero-sub lp-enter" style={stagger(180)}>
        {HERO.sub}
      </p>

      <div className="lp-hero-actions lp-enter" style={stagger(260)}>
        <PrimaryCta action={action} />
        <a
          href="#workflow"
          className="group inline-flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {HERO.scrollHint}
          <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
        </a>
      </div>
    </div>
  );
}
