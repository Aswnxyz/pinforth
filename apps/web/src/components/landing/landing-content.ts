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
  { id: "why-pinforth", label: "Why Pinforth" },
  { id: "workflow", label: "Workflow" },
  { id: "product", label: "Product" },
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

/**
 * Honest availability line shown in the hero: only capabilities marked
 * `live` in CAPABILITIES may be named here (guarded by claim tests).
 */
export const LIVE_LINE =
  "Live today — workspaces · projects · environments · team";

export const PROBLEM = {
  id: "why-pinforth",
  eyebrow: "The problem",
  headline: "Website review is scattered everywhere but here.",
  body: "Feedback arrives in chat threads, email, screenshots, and spreadsheets. Fixes get claimed, not retested. And when it is time to sign off, nobody can say which version was approved.",
  /** Fragment chips: the scattered places feedback ends up today. */
  fragments: PROBLEM_CHIPS,
} as const;

export const WORKFLOW = {
  id: "workflow",
  eyebrow: "How Pinforth works",
  headline: "One thread, from first report to final sign-off.",
  body: "Every issue keeps its original context, its fixes, and its retest results — attached to the exact deployment they belong to.",
  visionLabel: "Product vision preview",
} as const;

export const PRODUCT = {
  id: "product",
  eyebrow: "The workspace",
  headline: "Your whole delivery pipeline, on one table.",
  body: "Projects, environments, and team access are live today. The review workspace they'll live in is being built on top of them.",
  /** Marker on the workspace mock: it shows shipped functionality. */
  liveLabel: "Live today",
  /**
   * The showcase's static representation of the shipped workspace —
   * organization, projects, environments and members, as the app renders
   * them today. Claim tests treat this as marketing copy.
   */
  mock: {
    workspace: "Acme Studio",
    action: "New project",
    projects: [
      {
        name: "Qzen — Marketing Website",
        meta: "Brand refresh · Created Nov 2, 2026",
      },
      {
        name: "Aurel — Product Launch",
        meta: "Launch site · Created Oct 18, 2026",
      },
    ],
    environments: [
      { name: "Staging", url: "staging.acme.studio" },
      { name: "Production", url: "acme.studio" },
    ],
    team: [
      { name: "Ada Lovelace", role: "Owner" },
      { name: "Maya Chen", role: "Member" },
    ],
  },
} as const;

export const CLOSING = {
  eyebrow: "Start today",
  headline: "Set up the workspace. The review flow comes to it.",
  body: "Create your workspace, add your first project, and set up its environments — the foundation the rest of Pinforth is being built on.",
  secondaryCta: { label: "See how it works", href: "#workflow" },
} as const;

export const HERO = {
  eyebrow: "Website delivery, simplified",
  /**
   * Staircase headline: three lines, each indented one step further, the
   * last one carrying the coral highlighter accent.
   */
  headlineLines: ["From client feedback", "to final approval,", "In one place."],
  headlineAccent: "In one place.",
  scrollHint: "See how it works",
  /**
   * Vision-scoped: "is bringing" keeps the copy honest about capabilities
   * that are still planned (see CAPABILITIES) rather than claiming the full
   * feedback-to-approval flow ships today.
   */
  sub: "Pinforth is bringing visual feedback, issue tracking, fix verification, and release approvals into one clear, collaborative workflow for agencies and dev teams.",
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
  PROBLEM,
  WORKFLOW,
  PRODUCT,
  CLOSING,
  LIVE_LINE,
  HERO,
});
