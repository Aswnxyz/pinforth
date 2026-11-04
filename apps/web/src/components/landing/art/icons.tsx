import type { SVGProps } from "react";

/** Small arrow used by the hero's secondary CTA (no video exists — no play icon). */
export function ArrowDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M8 3v9m0 0 3.5-3.5M8 12l-3.5-3.5" />
    </svg>
  );
}

/** Browser chrome: back / forward page controls. */
export function ChromeBack(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path d="m9.5 3.5-4.5 4.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChromeForward(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path d="m6.5 3.5 4.5 4.5-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Browser chrome: reload. */
export function ChromeReload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path d="M13 8a5 5 0 1 1-1.46-3.54" strokeLinecap="round" />
      <path d="M11.4 1.6v3.2H8.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Padlock for the URL pill. */
export function LockGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4} {...props}>
      <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
    </svg>
  );
}

/** Feedback pin for the chrome's feedback-mode chip. */
export function PinMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4} {...props}>
      <path d="M8 1.8c2.3 0 4.2 1.9 4.2 4.2 0 3-4.2 8.2-4.2 8.2S3.8 9 3.8 6C3.8 3.7 5.7 1.8 8 1.8Z" strokeLinejoin="round" />
      <circle cx="8" cy="6" r="1.6" />
    </svg>
  );
}

/** Rail row marker: completed step. */
export function StatusDone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="9" fill="var(--accent)" />
      <path
        d="m6 10.2 2.6 2.6L14 7.4"
        fill="none"
        stroke="var(--accent-foreground)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Rail row marker: pending step. */
export function StatusPending(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <circle
        cx="10"
        cy="10"
        r="8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** Decorative paper plane with a dashed flight path, used by the hero collage. */
export function PaperPlane(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" fill="none" {...props}>
      <path
        d="M4 62C22 58 34 46 52 30"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 6"
      />
      <path
        d="M58 12l44 12-36 20 2-14-10-18z"
        fill="var(--lp-coral-soft)"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}