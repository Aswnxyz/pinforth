# Pinforth — Landing Page V2 Implementation Brief

**Status:** Visual direction approved. **Scope:** Marketing homepage only. **Branch:** `design/landing-page-v2`.

## Goal
Build a distinct, premium, cinematic/editorial landing page for Pinforth that communicates its intended website-feedback-to-sign-off workflow. Use the accompanying approved concept image as an art-direction reference, **not** a screenshot to paste onto the website or a pixel-perfect specification.

## Project context
- Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, pnpm workspace.
- Existing homepage: `apps/web/src/app/page.tsx`.
- Existing design tokens: `apps/web/src/app/globals.css` (light-first Porcelain & Moss).
- Existing logo component: `apps/web/src/components/brand/pinforth-logo`.
- Existing AuthProvider and authentication-aware homepage CTAs must remain functional.
- Existing application functionality: authentication, organizations, project management, website environments, members. Full visual feedback, issue QA and release approval workflow is **planned** and not yet complete.

## Creative direction
- Dark near-black green background with elegant ivory typography, subtle warm gray text, and carefully placed luminous pale-green accents.
- Editorial **asymmetry**: left-aligned oversized hero copy and a strong right-hand visual composition.
- Hero visual: an elegant browser/staging-site mockup with one or two contextual client-feedback annotations, positioned next to a restrained workflow status column. Use original/appropriately licensed imagery. The staging website is an illustration, not a customer claim.
- Subtle depth, fine rules, restrained glow, textured transitions, and layered perspective. Avoid default AI-template motifs: neon arcs everywhere, generic dashboard cards, floating 3D blobs, mountains-as-background filler, fake logos/testimonials or feature-stat claims.
- Distinct typography: excellent rhythm, large heading scale, optionally a tasteful display serif balanced by a modern readable sans. Maintain consistency.
- Keep the existing Pinforth brand mark unless a branding change is independently approved.

## Page structure
1. **Navigation** — logo, meaningful links to section IDs (Product, Workflow, Why Pinforth, Roadmap if real copy exists), accessible menu on mobile. Authentication-aware controls: signed in → Workspace and sign out as appropriate; signed out → Sign in / Create account. Do **not** advertise Pricing before a pricing model exists.
2. **Hero** — eyebrow, bold editorial headline (approved concept: “From client feedback to final approval. In one place.”), succinct accurate supporting copy, primary CTA using existing registration/workspace routes, secondary CTA anchored to workflow. Distinctive annotated staging-site visual, not a plain screenshot of a dashboard.
3. **The problem** — minimal, expressive visual explanation of scattered client feedback, conversations, screenshots and unverified fixes. Avoid implying direct integrations with other products.
4. **Workflow** — a carefully art-directed sequence: Capture → Organize → Fix → Verify → Approve. Clearly label unimplemented steps as *product vision* / *coming soon*. Responsive treatment for narrow screens.
5. **Product** — showcase **real implemented** organization, project, member and environment management UI; if a mock illustrates future issues/QA/approval, label it conceptually. Use real components or carefully constructed original static representations.
6. **Closing CTA and footer** — strong closing visual and clear action; only real working links. Include subtle early-development honesty where appropriate.

## Motion & performance
- Motion should illustrate product meaning: annotation appears → issue is formed → fix/check → approval. A restrained hero entrance and scroll-triggered transitions may support the story.
- Favor CSS and modern browser primitives for simple animation; add a library only where it demonstrably improves interaction. Don't install multiple motion frameworks.
- No full-screen autoplay video by default. If video is used, keep a static fallback, load responsibly and honor `prefers-reduced-motion`.
- Test on a lower-end device; avoid animation-induced layout shifts, heavy scroll handlers, huge backgrounds or excessive image/video bytes.

## Engineering boundaries
- Work on `design/landing-page-v2`, never directly on `main`.
- No changes to API routes, database models/migrations, authorization logic or workspace product functionality.
- Keep dark styles **scoped to homepage**, unless an isolated reusable token addition is necessary. Do not switch all of Pinforth's existing light app screens to dark.
- Preserve accessibility: keyboard interaction, semantic headings, visible focus, contrast, alt text, sensible touch targets, reduced-motion fallback.
- Preserve routing: `/`, `/register`, `/login`, `/w` and sign-out behavior. Ensure homepage works in auth-loading, authenticated and anonymous states.
- Use clean component boundaries, no unnecessary dependencies, mobile-first responsive layouts. Do not ship the supplied concept as a flattened image.

## Validation / acceptance criteria
- Visual quality should match the approved **art direction**, not slavishly mimic generated UI labels or make false product claims.
- Header/CTA/sign-out work for logged-in and logged-out visitors.
- All nav section links target real elements; mobile navigation works.
- No horizontal scrolling at 375px, readable layouts at tablet and 1440px desktop.
- Keyboard navigation, reduced-motion behavior and meaningful focus treatments pass manual checks.
- `pnpm build:shared`, `pnpm lint:web`, `pnpm test:web`, and `pnpm build:web` run or failures are clearly reported with evidence.
- Confirm no behavior change to existing organization/project/member pages.
- Before committing: show a before/after screenshot, a short change summary, any caveats, and the exact changed files. **Do not merge into main** without the teammate's review.

## Implementation order
1. Inspect the current homepage, routes, styles and existing components; present a short implementation plan.
2. Implement structural layout and typographic system.
3. Implement the signature hero staging-site mock and meaningful microinteractions.
4. Build responsive problem, workflow, product and final CTA sections.
5. Verify accessibility, motion fallback, runtime performance and all existing navigation.
6. Provide screenshots and validation output before preparing the PR.
