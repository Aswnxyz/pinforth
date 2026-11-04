import { describe, expect, it } from "vitest";
import {
  ALL_COPY,
  CAPABILITIES,
  NAV_SECTIONS,
  PRIMARY_CTA_LABEL,
  SECTION_IDS,
  WORKFLOW_STEPS,
  navActions,
  primaryCtaAction,
} from "@/components/landing/landing-content";

const BANNED_TERMS =
  /slack|notion|gmail|whatsapp|trello|asana|figma|jira/i;

describe("landing navigation sections", () => {
  it("has unique section ids that match the nav entries exactly", () => {
    expect(SECTION_IDS).toEqual(["product", "workflow", "why-pinforth"]);
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
    // hrefs are derived as `#${id}` in the nav, so the ids are the contract.
    expect(NAV_SECTIONS.map((section) => section.id)).toEqual(SECTION_IDS);
    for (const section of NAV_SECTIONS) {
      expect(SECTION_IDS).toContain(section.id);
    }
  });

  it("never advertises pricing", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.label).not.toMatch(/pricing/i);
    }
    expect(ALL_COPY).not.toMatch(/pricing/i);
  });

  it("never implies a free tier", () => {
    expect(ALL_COPY).not.toMatch(/\bfree\b/i);
    expect(PRIMARY_CTA_LABEL).toBe("Create workspace");
  });

  it("names no third-party products", () => {
    expect(ALL_COPY).not.toMatch(BANNED_TERMS);
  });
});

describe("workflow steps and capabilities", () => {
  it("carries the five workflow steps in order with a valid availability", () => {
    expect(WORKFLOW_STEPS.map((step) => step.id)).toEqual([
      "capture",
      "organize",
      "fix",
      "verify",
      "approve",
    ]);
    for (const step of WORKFLOW_STEPS) {
      expect(["live", "planned"]).toContain(step.availability);
    }
  });

  it("lists both shipped and planned capabilities", () => {
    expect(
      CAPABILITIES.filter((item) => item.availability === "live").length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      CAPABILITIES.filter((item) => item.availability === "planned").length,
    ).toBeGreaterThanOrEqual(4);
    for (const item of CAPABILITIES) {
      expect(["live", "planned"]).toContain(item.availability);
    }
  });
});

describe("primaryCtaAction", () => {
  it("holds the loading state as a skeleton, not a link", () => {
    expect(primaryCtaAction(false, true)).toEqual({ kind: "loading" });
  });

  it("sends anonymous visitors to registration", () => {
    expect(primaryCtaAction(false, false)).toEqual({
      kind: "anonymous",
      href: "/register",
      label: "Create workspace",
    });
  });

  it("sends signed-in visitors to their workspace", () => {
    expect(primaryCtaAction(true, false)).toEqual({
      kind: "authenticated",
      href: "/w",
      label: "Go to your workspace",
    });
  });
});

describe("navActions", () => {
  it("shows a skeleton while the session resolves", () => {
    expect(navActions(false, true)).toEqual({ kind: "loading" });
  });

  it("greets the signed-in user by name", () => {
    expect(navActions(true, false, "Ada")).toEqual({
      kind: "authenticated",
      href: "/w",
      label: "Ada",
    });
  });

  it("offers sign-in to anonymous visitors", () => {
    expect(navActions(false, false)).toEqual({ kind: "anonymous" });
  });
});
