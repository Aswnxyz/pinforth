import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroStage } from "@/components/landing/hero-stage";
import { PrimaryCta } from "@/components/landing/primary-cta";
import { HERO } from "@/components/landing/landing-content";

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
