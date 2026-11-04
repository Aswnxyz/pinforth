import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClosingSection } from "@/components/landing/closing-section";
import { HeroStage } from "@/components/landing/hero-stage";
import { PrimaryCta } from "@/components/landing/primary-cta";
import { ProblemSection } from "@/components/landing/problem-section";
import { ProductSection } from "@/components/landing/product-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import {
  HERO,
  LIVE_LINE,
  SECTION_IDS,
  WORKFLOW_STEPS,
} from "@/components/landing/landing-content";

// The closing CTA is an auth-aware island; these render tests only care about
// the surrounding copy, so pin it to the anonymous state.
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

describe("PrimaryCta states", () => {
  it("renders the loading state as a busy skeleton with no link", () => {
    const html = renderToStaticMarkup(
      <PrimaryCta action={{ kind: "loading" }} />,
    );
    expect(html).toContain("aria-busy");
    expect(html).not.toContain("href");
  });

  it("points anonymous visitors at registration", () => {
    const html = renderToStaticMarkup(
      <PrimaryCta action={{ kind: "anonymous", href: "/register", label: "Create workspace" }} />,
    );
    expect(html).toContain('href="/register"');
    expect(html).toContain("Create workspace");
  });

  it("points signed-in visitors at their workspace", () => {
    const html = renderToStaticMarkup(
      <PrimaryCta
        action={{ kind: "authenticated", href: "/w", label: "Go to your workspace" }}
      />,
    );
    expect(html).toContain('href="/w"');
    expect(html).toContain("Go to your workspace");
  });
});

describe("HeroStage", () => {
  const html = renderToStaticMarkup(<HeroStage />);

  it("shows the staging URL in the browser chrome", () => {
    expect(html).toContain("staging.acme.studio");
  });

  it("carries the client annotation on the selection", () => {
    expect(html).toContain(HERO.annotation.text);
  });

  it("lists all five status rail rows in order", () => {
    let previous = -1;
    for (const row of HERO.rail) {
      const at = html.indexOf(row.label);
      expect(at, `missing rail label "${row.label}"`).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
  });
});

describe("page sections", () => {
  const sections = [
    renderToStaticMarkup(<ProblemSection />),
    renderToStaticMarkup(<WorkflowSection />),
    renderToStaticMarkup(<ProductSection />),
    renderToStaticMarkup(<ClosingSection />),
  ].join("\n");

  it("resolves every nav anchor to a real section id", () => {
    for (const id of SECTION_IDS) {
      expect(sections, `missing section #${id}`).toContain(`id="${id}"`);
    }
  });

  it("renders the five workflow steps in order with the vision label", () => {
    const workflow = renderToStaticMarkup(<WorkflowSection />);
    let previous = -1;
    for (const step of WORKFLOW_STEPS) {
      const at = workflow.indexOf(step.title);
      expect(at, `missing workflow step "${step.title}"`).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
    expect(workflow).toContain("Product vision preview");
  });

  it("shows the live-today line on the page", () => {
    expect(sections).toContain(LIVE_LINE);
  });

  it("marks planned sections as vision, not shipped UI", () => {
    // The product showcase splits shipped from planned; the page must not
    // claim the full workflow is available today.
    const product = renderToStaticMarkup(<ProductSection />);
    expect(product).toContain("Live today");
    expect(product).toContain("In the product vision");
    expect(product).toMatch(/role="img" aria-label="Live today/);
    expect(sections).not.toMatch(/pricing/i);
  });
});
