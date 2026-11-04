/**
 * Landing Page V2 content and CTA logic.
 *
 * Single source of truth for marketing copy and for the auth-aware CTA
 * decisions, so the claim tests here cover everything the page renders and
 * the client islands stay presentational.
 */

export type Availability = "live" | "planned";

export const PRIMARY_CTA_LABEL = "Create workspace";

export interface NavSection {
  id: "product" | "workflow" | "why-pinforth";
  label: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "product", label: "Product" },
  { id: "workflow", label: "Workflow" },
  { id: "why-pinforth", label: "Why Pinforth" },
];

/** Section ids in nav order; nav hrefs are derived as `#${id}`. */
export const SECTION_IDS: readonly string[] = NAV_SECTIONS.map(
  (section) => section.id,
);

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  availability: Availability;
}

export interface Capability {
  label: string;
  availability: Availability;
}

/**
 * The workflow Pinforth is built to deliver. Every step is planned
 * functionality until it ships — the section renders this as product vision.
 */
export const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    id: "capture",
    title: "Capture",
    description: "Get visual, contextual feedback on the live site.",
    availability: "planned",
  },
  {
    id: "organize",
    title: "Organize",
    description: "Turn feedback into trackable issues.",
    availability: "planned",
  },
  {
    id: "fix",
    title: "Fix",
    description: "Work on the right changes, faster.",
    availability: "planned",
  },
  {
    id: "verify",
    title: "Verify",
    description: "Confirm fixes on the staging site.",
    availability: "planned",
  },
  {
    id: "approve",
    title: "Approve",
    description: "Get a clear sign-off and ship with confidence.",
    availability: "planned",
  },
];

/** What exists in the product today versus what is still coming. */
export const CAPABILITIES: readonly Capability[] = [
  { label: "Workspaces", availability: "live" },
  { label: "Projects", availability: "live" },
  { label: "Team & access", availability: "live" },
  { label: "Website environments", availability: "live" },
  { label: "Visual feedback capture", availability: "planned" },
  { label: "Issue tracking", availability: "planned" },
  { label: "Fix verification", availability: "planned" },
  { label: "Release approval", availability: "planned" },
];

/**
 * The problem statement chips. Deliberately generic: no third-party product
 * is named and no integration with another tool is implied.
 */
export const PROBLEM_CHIPS: readonly string[] = [
  "Feedback in email threads",
  "Scattered chat messages",
  "Screenshots and files",
  "Tracking in spreadsheets",
  "And still, unclear approvals.",
];

export const HERO = {
  eyebrow: "Website delivery, simplified",
  headline: "From client feedback to final approval.",
  headlineAccent: "In one place.",
  /**
   * Vision-scoped: "is bringing" keeps the copy honest about capabilities
   * that are still planned (see CAPABILITIES) rather than claiming the full
   * feedback-to-approval flow ships today.
   */
  sub: "Pinforth is bringing visual feedback, issue tracking, fix verification, and release approvals into one clear, collaborative workflow for agencies and dev teams.",
  secondaryCta: { label: "See how it works", href: "#workflow" },
  /** Visible mark on the hero demo: it illustrates the flow, it is not shipped UI. */
  visionLabel: "Product vision preview",
  /** Client comment pinned on the selection inside the hero browser mock. */
  annotation: {
    author: "Client",
    time: "2m ago",
    text: "Can we reduce the roof shadow here?",
  },
  /** Status rail rows beside the mock (illustrative project workflow). */
  rail: [
    { label: "Feedback", state: "done" },
    { label: "Issue created", state: "done" },
    { label: "Fix in progress", state: "pending" },
    { label: "Verify fix", state: "pending" },
    { label: "Release approval", state: "pending" },
  ],
} as const;

/**
 * The primary CTA's resolved state.
 *
 * While the session is still loading there is no link at all — the button
 * renders a same-geometry skeleton instead, so a visitor never sees an
 * anonymous CTA that swaps after authentication resolves.
 */
export type PrimaryCtaAction =
  | { kind: "loading" }
  | { kind: "anonymous"; href: "/register"; label: typeof PRIMARY_CTA_LABEL }
  | { kind: "authenticated"; href: "/w"; label: "Go to your workspace" };

export function primaryCtaAction(
  isAuthenticated: boolean,
  isLoading: boolean,
): PrimaryCtaAction {
  if (isLoading) return { kind: "loading" };
  if (isAuthenticated) {
    return {
      kind: "authenticated",
      href: "/w",
      label: "Go to your workspace",
    };
  }
  return { kind: "anonymous", href: "/register", label: PRIMARY_CTA_LABEL };
}

export type NavAction =
  | { kind: "loading" }
  | { kind: "authenticated"; href: "/w"; label: string }
  | { kind: "anonymous" };

export function navActions(
  isAuthenticated: boolean,
  isLoading: boolean,
  userName?: string | null,
): NavAction {
  if (isLoading) return { kind: "loading" };
  if (isAuthenticated) {
    return { kind: "authenticated", href: "/w", label: userName ?? "Workspace" };
  }
  return { kind: "anonymous" };
}

/** Every piece of marketing copy the claim tests inspect. */
export const ALL_COPY: string = JSON.stringify({
  PRIMARY_CTA_LABEL,
  NAV_SECTIONS,
  WORKFLOW_STEPS,
  CAPABILITIES,
  PROBLEM_CHIPS,
  HERO,
});
