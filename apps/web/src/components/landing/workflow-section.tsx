import { WORKFLOW, WORKFLOW_STEPS } from "./landing-content";

/**
 * Section 03 — How Pinforth Works (`#workflow`).
 *
 * Server component: the five-step thread, each step carrying its honest
 * availability so planned steps read as vision rather than shipped UI.
 */
export function WorkflowSection() {
  return (
    <section
      id={WORKFLOW.id}
      aria-labelledby={`${WORKFLOW.id}-heading`}
      className="lp-section"
    >
      <div className="lp-container lp-workflow">
        <div className="lp-section-head lp-reveal">
          <p className="lp-eyebrow">{WORKFLOW.eyebrow}</p>
          <h2 id={`${WORKFLOW.id}-heading`} className="lp-h2">
            {WORKFLOW.headline}
          </h2>
          <p className="lp-lede">{WORKFLOW.body}</p>
          <p className="lp-vision">
            <span aria-hidden="true" className="lp-vision-dot" />
            {WORKFLOW.visionLabel}
          </p>
        </div>

        <ol className="lp-steps">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step.id} className="lp-step lp-reveal">
              <span className="lp-step-num" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-desc">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
