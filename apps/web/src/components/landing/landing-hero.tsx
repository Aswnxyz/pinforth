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
 * once the session resolves.
 */
export function LandingHero() {
  const { isAuthenticated, isLoading } = useAuth();
  const action = primaryCtaAction(isAuthenticated, isLoading);

  return (
    <div className="relative z-10">
      <p className="lp-eyebrow lp-enter" style={stagger(0)}>
        {HERO.eyebrow}
      </p>

      <h1
        className="lp-serif lp-enter mt-5 max-w-[34rem] text-[2.5rem] leading-[1.04] tracking-[-0.015em] sm:text-6xl xl:text-[4rem]"
        style={stagger(90)}
      >
        <span className="block">{HERO.headline}</span>
        <span className="lp-serif-accent block whitespace-nowrap">
          {HERO.headlineAccent}
        </span>
      </h1>

      <p
        className="lp-enter mt-6 max-w-xl text-base leading-7 text-muted-foreground"
        style={stagger(180)}
      >
        {HERO.sub}
      </p>

      <div
        className="lp-enter mt-8 flex flex-wrap items-center gap-x-7 gap-y-4"
        style={stagger(260)}
      >
        <PrimaryCta action={action} />
        <a
          href={HERO.secondaryCta.href}
          className="group inline-flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {HERO.secondaryCta.label}
          <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
        </a>
      </div>
    </div>
  );
}
