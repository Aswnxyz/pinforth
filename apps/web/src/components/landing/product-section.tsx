import { PinforthLogo } from "@/components/brand/pinforth-logo";
import { CAPABILITIES, PRODUCT } from "./landing-content";

/**
 * Section 04 — Product Workspace showcase (`#product`).
 *
 * Server component. The mock is a static representation of the shipped
 * workspace — organization, projects, environments and members as the app
 * renders them today — so it wears the live marker; the capability list
 * beside it splits live from planned so no claim runs ahead of the product.
 */
export function ProductSection() {
  const live = CAPABILITIES.filter((item) => item.availability === "live");
  const planned = CAPABILITIES.filter((item) => item.availability === "planned");
  const { mock } = PRODUCT;

  return (
    <section
      id={PRODUCT.id}
      aria-labelledby={`${PRODUCT.id}-heading`}
      className="lp-section"
    >
      <div className="lp-container">
        <div className="lp-section-head lp-reveal">
          <p className="lp-eyebrow">{PRODUCT.eyebrow}</p>
          <h2 id={`${PRODUCT.id}-heading`} className="lp-h2">
            {PRODUCT.headline}
          </h2>
          <p className="lp-lede">{PRODUCT.body}</p>
        </div>

        <div className="lp-product-grid">
          <div
            className="lp-workspace-mock lp-reveal"
            role="img"
            aria-label={`${PRODUCT.liveLabel} — Pinforth workspace showing projects, environments, and team access`}
          >
            {/* App header, as the workspace renders it: brand, workspace
                identity, primary action. */}
            <div className="lp-mock-bar">
              <PinforthLogo variant="full" size="sm" />
              <span className="lp-mock-org">
                {mock.workspace}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="size-3 fill-current text-muted-foreground"
                >
                  <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </span>
              <span className="lp-mock-action">{mock.action}</span>
              <span className="lp-mock-live">
                <span aria-hidden="true" className="lp-live-dot" />
                {PRODUCT.liveLabel}
              </span>
            </div>

            <div className="lp-mock-body">
              <div className="lp-mock-panel">
                <span className="lp-mock-label">Projects</span>
                <ul className="lp-mock-list">
                  {mock.projects.map((project) => (
                    <li key={project.name} className="lp-mock-item">
                      <span className="lp-mock-item-main">
                        <span className="lp-mock-item-name">
                          {project.name}
                        </span>
                        <span className="lp-mock-item-meta">
                          {project.meta}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Environments live under a project in the app, so the panel
                  names the project it belongs to. */}
              <div className="lp-mock-panel">
                <span className="lp-mock-label">Environments · Qzen</span>
                <ul className="lp-mock-list">
                  {mock.environments.map((environment) => (
                    <li key={environment.name} className="lp-mock-item">
                      <span className="lp-mock-item-name">
                        {environment.name}
                      </span>
                      <span className="lp-mock-item-url">
                        {environment.url}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lp-mock-panel">
                <span className="lp-mock-label">Team</span>
                <ul className="lp-mock-list">
                  {mock.team.map((member) => (
                    <li key={member.name} className="lp-mock-item">
                      <span className="lp-mock-avatar" aria-hidden="true">
                        {member.name.charAt(0)}
                      </span>
                      <span className="lp-mock-item-name">{member.name}</span>
                      <span className="lp-mock-role">{member.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="lp-capabilities lp-reveal">
            <h3 className="lp-cap-title">Live today</h3>
            <ul className="lp-cap-list">
              {live.map((item) => (
                <li key={item.label} className="lp-cap lp-cap-live">
                  {item.label}
                </li>
              ))}
            </ul>
            <h3 className="lp-cap-title">In the product vision</h3>
            <ul className="lp-cap-list">
              {planned.map((item) => (
                <li key={item.label} className="lp-cap lp-cap-planned">
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
