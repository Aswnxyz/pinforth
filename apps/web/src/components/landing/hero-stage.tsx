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
  StatusDone,
  StatusPending,
} from "./art/icons";

const stagger = (ms: number) => ({ "--lp-delay": `${ms}ms` } as CSSProperties);

/**
 * The hero's staging-site scene: browser chrome around the hero photograph,
 * the client's pinned selection with its annotation, and the status rail.
 *
 * Server component — only text and static SVG here; the auth-aware CTA
 * lives in `landing-hero.tsx`.
 */
export function HeroStage({ className = "" }: { className?: string }) {
  return (
    <div className={`relative lp-enter ${className}`} style={stagger(340)}>
      {/* Backing plate: a second plane peeking out behind the window, so the
          stage reads as layered objects rather than one flat screenshot. */}
      <div
        aria-hidden="true"
        className="absolute -bottom-5 -left-4 right-12 top-10 -z-10 rounded-2xl bg-gradient-to-br from-accent/15 via-white/[0.03] to-transparent ring-1 ring-white/[0.05] lg:-left-6 lg:top-12 lg:[transform:perspective(1600px)_rotateY(7deg)]"
      />

      {/* Vision label, overlapping the window edge — the demo illustrates the
          flow; it is not a claim that the flow ships today. */}
      <span
        className="lp-enter absolute -top-3 left-4 z-20 rounded-full border border-accent/35 bg-surface/90 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent shadow-[0_8px_24px_-10px_rgba(0,0,0,0.9)] backdrop-blur"
        style={stagger(760)}
      >
        {HERO.visionLabel}
      </span>

      {/* The mock itself is tilted on wide screens; the rail stays flat. */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.14] bg-surface-raised shadow-[0_50px_120px_-45px_rgba(126,214,139,0.35),0_30px_60px_-30px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/[0.06] lg:-mr-20 lg:rounded-2xl xl:-mr-28 lg:[transform:perspective(1600px)_rotateY(7deg)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.3)]" />
          <span className="size-2.5 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.3)]" />
          <span className="size-2.5 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.3)]" />
          <span
            aria-hidden="true"
            className="ml-1.5 flex items-center gap-1 text-muted-foreground/70"
          >
            <ChromeBack className="size-3.5" />
            <ChromeForward className="size-3.5" />
            <ChromeReload className="size-3.5" />
          </span>
          <span className="mx-auto flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-[11px] tracking-wide text-muted-foreground">
            <LockGlyph className="size-3 shrink-0 text-accent/80" />
            staging.acme.studio
          </span>
        </div>

        {/* Scene with the pinned selection */}
        <div className="relative aspect-[16/10]">
          <Image
            src="/landing/hero-site-dusk.webp"
            alt="A contemporary house glowing at dusk, shown as the website under review"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
          />
          {/* The widget's mode indicator, floating on the staged page */}
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-accent/30 bg-surface/85 px-2.5 py-1 text-[10px] font-medium tracking-wide text-accent shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur">
            <PinMark className="size-3" />
            Feedback mode
          </span>
          {/* Cinematic grade: darken and vignette so the scene sits in the page */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#07100a]/10 shadow-[inset_0_0_70px_rgba(7,11,8,0.55)]"
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
            <circle cx="205" cy="534" r="8" fill="var(--accent)" stroke="#0b1e12" strokeWidth="2.5" />
            {/* Cursor */}
            <path
              d="M0 0L0 26L6.5 20L11 29L15.5 27L11 18L19 18Z"
              fill="#f1f4ec"
              stroke="#0b1e12"
              strokeWidth={1.5}
              transform="translate(878 636) scale(2.1)"
            />
          </svg>

          {/* Client annotation card (anchored top-left to meet the line) */}
          <div
            className="lp-enter absolute left-[8%] top-[62%] w-[47%] max-w-[17rem] rounded-lg border border-white/[0.14] bg-surface-raised/95 p-3 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-sm"
            style={stagger(560)}
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground ring-2 ring-accent/30">
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

      {/* Status rail: over the mock on wide screens, stacked below on mobile */}
      <aside
        className="lp-enter relative z-10 mt-4 w-full rounded-xl border border-white/[0.14] bg-surface-raised/95 p-3 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-sm lg:absolute lg:right-0 lg:top-14 lg:mt-0 lg:w-60 lg:p-4"
        style={stagger(460)}
        aria-label="Product vision preview: illustrative release workflow status"
      >
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <PinforthLogo variant="full" size="sm" />
          <span aria-hidden="true" className="text-muted-foreground">
            <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[1.5]">
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
          </span>
        </div>
        <ul className="mt-1.5 flex flex-col gap-1">
          {HERO.rail.map((row, index) => (
            <li
              key={row.label}
              className="lp-enter flex items-center gap-2.5 rounded-md px-1 py-1.5"
              style={stagger(620 + index * 70)}
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
    </div>
  );
}
