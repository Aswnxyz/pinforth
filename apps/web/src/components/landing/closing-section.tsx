import Link from "next/link";
import { ClosingCta } from "./closing-cta";
import { CLOSING, LIVE_LINE } from "./landing-content";

/**
 * Section 05 — Closing CTA.
 *
 * Server component. Only the CTA is an island, because its target depends on
 * the visitor's session.
 */
export function ClosingSection() {
  return (
    <section aria-labelledby="closing-heading" className="lp-section lp-closing">
      <div className="lp-container lp-closing-inner">
        <div className="lp-section-head lp-reveal">
          <p className="lp-eyebrow">{CLOSING.eyebrow}</p>
          <h2 id="closing-heading" className="lp-h2">
            {CLOSING.headline}
          </h2>
          <p className="lp-lede">{CLOSING.body}</p>
          <div className="lp-cta-row">
            <ClosingCta />
            <Link href={CLOSING.secondaryCta.href} className="lp-ghost">
              {CLOSING.secondaryCta.label}
            </Link>
          </div>
          <p className="lp-live">
            <span aria-hidden="true" className="lp-live-dot" />
            {LIVE_LINE}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The page footer, rendered outside `<main>` so it stays a contentinfo. */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <p className="lp-footer-brand">Pinforth</p>
        <p className="lp-footer-tag">From feedback to sign-off.</p>
        <p className="lp-footer-note">© Pinforth. All rights reserved.</p>
      </div>
    </footer>
  );
}
