import Image from "next/image";
import type { CSSProperties } from "react";
import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { HERO } from "./landing-content";
import {
  ChromeBack,
  ChromeForward,
  ChromeReload,
  LockGlyph,
  PinMark,
  PaperPlane,
  StatusDone,
  StatusPending,
} from "./art/icons";

const stagger = (ms: number) => ({ "--lp-delay": `${ms}ms` } as CSSProperties);

/**
 * The hero collage: a browser window reviewing the staging site, the client's
 * pinned note, and the workflow rail as a receipt pinned to its left edge.
 *
 * Server component — only text and static SVG here; the auth-aware CTA lives
 * in `landing-hero.tsx`.
 */
export function HeroStage({ className = "" }: { className?: string }) {
  return (
    <div className={`lp-stage lp-enter ${className}`} style={stagger(300)}>
      {/* Backing plane: a second sheet under the window, so the collage
          reads as layered paper rather than one flat screenshot. */}
      <div aria-hidden="true" className="lp-stage-back" />

      {/* The demo illustrates the flow; it is not a claim that it ships. */}
      <span className="lp-enter absolute -top-7 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground shadow-sm">
        <span aria-hidden="true" className="size-1.5 rounded-full border-[1.5px] border-accent" />
        {HERO.visionLabel}
      </span>

      <div className="lp-stage-window">
        {/* Browser chrome */}
        <div className="lp-stage-chrome">
          <span className="size-2.5 rounded-full bg-[#e5695a]" />
          <span className="size-2.5 rounded-full bg-[#e9b949]" />
          <span className="size-2.5 rounded-full bg-[#79b487]" />
          <span aria-hidden="true" className="ml-1.5 flex items-center gap-1 text-muted-foreground">
            <ChromeBack className="size-3.5" />
            <ChromeForward className="size-3.5" />
            <ChromeReload className="size-3.5" />
          </span>
          <span className="lp-stage-url">
            <LockGlyph className="size-3 shrink-0 text-[var(--lp-forest)]" />
            staging.acme.studio
          </span>
        </div>

        {/* Scene with the pinned selection */}
        <div className="lp-stage-scene">
          <Image
            src="/landing/hero-site-dusk.webp"
            alt="A contemporary house glowing at dusk, shown as the website under review"
            fill
            preload
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
          {/* The widget's mode indicator, floating on the staged page */}
          <span className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/90 px-2.5 py-1 text-[10px] font-medium tracking-wide text-[var(--lp-forest)] shadow-sm backdrop-blur">
            <PinMark className="size-3" />
            Feedback mode
          </span>
          {/* Warm grade so the scene sits inside the ivory page */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#f5f2ec]/5 shadow-[inset_0_0_70px_rgba(32,39,37,0.28)]"
          />
          <svg
            viewBox="0 0 1600 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            {/* Selected region (dashed loop) */}
            <rect
              x={140}
              y={170}
              width={700}
              height={360}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={4}
              strokeDasharray="22 14"
              className="lp-dash"
            />
            {[
              [140, 170], [840, 170], [140, 530], [840, 530],
            ].map(([x, y]) => (
              <rect
                key={`${x}-${y}`}
                x={x - 9}
                y={y - 9}
                width={18}
                height={18}
                fill="var(--accent)"
              />
            ))}
            {/* Leader line from the annotation card to its anchor on the selection */}
            <path
              d="M150 617 L205 534"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.85}
            />
            <circle cx="205" cy="534" r="8" fill="var(--accent)" stroke="#fbf9f4" strokeWidth="2.5" />
            {/* Cursor */}
            <path
              d="M0 0L0 26L6.5 20L11 29L15.5 27L11 18L19 18Z"
              fill="#fbf9f4"
              stroke="#202725"
              strokeWidth={1.5}
              transform="translate(878 636) scale(2.1)"
            />
          </svg>

          {/* Client annotation card, anchored to the leader line */}
          <div className="lp-note lp-enter" style={stagger(560)}>
            <div className="flex items-center gap-2">
              <span className="lp-note-avatar">
                {HERO.annotation.author.charAt(0)}
              </span>
              <span className="text-[11px] font-semibold text-foreground">
                {HERO.annotation.author}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {HERO.annotation.time}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              {HERO.annotation.text}
            </p>
          </div>
        </div>
      </div>

      {/* Workflow rail: a printed receipt pinned to the collage's left edge. */}
      <aside
        className="lp-stage-rail lp-enter"
        style={stagger(440)}
        aria-label="Product vision preview: illustrative release workflow status"
      >
        <div className="flex items-center justify-between border-b border-dashed border-border pb-2.5">
          <PinforthLogo variant="full" size="sm" />
          <span aria-hidden="true" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Release
          </span>
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {HERO.rail.map((row, index) => (
            <li
              key={row.label}
              className="lp-enter flex items-center gap-2.5 rounded-md px-1 py-1"
              style={stagger(600 + index * 70)}
            >
              {row.state === "done" ? (
                <StatusDone className="size-4.5 shrink-0" />
              ) : (
                <StatusPending className="size-4.5 shrink-0 text-border-strong" />
              )}
              <span
                className={
                  row.state === "done"
                    ? "text-[13px] text-foreground"
                    : "text-[13px] text-muted-foreground"
                }
              >
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Decorative paper plane with a dashed flight path. */}
      <PaperPlane className="lp-plane -bottom-6 right-6 hidden lg:block" />
    </div>
  );
}
