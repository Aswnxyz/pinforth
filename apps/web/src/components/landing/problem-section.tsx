import { PROBLEM } from "./landing-content";

/**
 * Section 02 — The Problem (`#why-pinforth`).
 *
 * Server component: static copy plus the scattered-feedback fragment chips.
 * The id is the nav anchor, so `aria-labelledby` points at the heading.
 */
export function ProblemSection() {
  return (
    <section
      id={PROBLEM.id}
      aria-labelledby={`${PROBLEM.id}-heading`}
      className="lp-section"
    >
      <div className="lp-container lp-problem">
        <div className="lp-section-head lp-reveal">
          <p className="lp-eyebrow">{PROBLEM.eyebrow}</p>
          <h2 id={`${PROBLEM.id}-heading`} className="lp-h2">
            {PROBLEM.headline}
          </h2>
          <p className="lp-lede">{PROBLEM.body}</p>
        </div>

        <ul className="lp-fragments" aria-label="Where feedback ends up today">
          {PROBLEM.fragments.map((fragment) => (
            <li key={fragment} className="lp-fragment lp-reveal">
              {fragment}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
