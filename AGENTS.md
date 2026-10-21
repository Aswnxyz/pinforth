# Pinforth — Product Context

**Tagline:** From feedback to sign-off.

## What Pinforth Is

Pinforth is an AI-assisted website feedback, issue-management, quality-assurance (QA) verification, and client release-approval platform. It is designed primarily for small web development agencies, freelancers, their developers and testers, and the clients who review websites before delivery.

Its purpose is to connect the entire website review and delivery process in one place:

**Visual feedback → Issue triage → Developer fix → QA verification → Release readiness → Client approval.**

The central promise is not merely that someone can report a bug. It is that an agency can show **what was reported, what was changed, whether the fix was actually retested, which website deployment was tested, and exactly which release the client approved**.

Pinforth is focused on reviewing real staging or preview websites and coordinating their delivery. It is not intended to replace a general-purpose project-management suite or become an autonomous AI coding platform.

## The Problem It Solves

Website reviews often take place across WhatsApp or other messaging apps, email, screenshots, calls, spreadsheets, and separate issue trackers. A client may say, “This button doesn't work,” without an exact page location, browser details, or reproduction steps. A developer may mark the task “done,” but the fix may not have been retested. A client may approve a website without a clear record of which deployed version was shown to them.

This creates several recurring problems:

- Feedback loses its page and element context.
- Clients struggle with technical issue-tracking interfaces.
- Developers spend time clarifying vague or duplicate reports.
- Teams confuse implementation with independent verification.
- Project managers cannot easily see what is still blocking delivery.
- Sign-off can become ambiguous when the staging website changes after approval.
- Decisions, evidence, and review history become scattered across tools.

Pinforth brings these activities into a single, understandable workflow with a reliable record of feedback, fixes, retesting, and approval.

## Who Uses Pinforth

### Agency owner, administrator, or project manager

Creates the organization and client projects; sets up website environments and review rounds; invites reviewers; triages issues; assigns work; monitors blockers; and requests final client sign-off.

### Developer

Receives actionable issues with the original page context and evidence; reproduces problems; implements fixes; identifies the updated deployment; and submits fixes for verification.

### QA tester or reviewer

Inspects original feedback and evidence; opens the relevant staging deployment; retests reported behavior; records the verification result and supporting evidence; and either verifies the fix or reopens the issue.

### Client reviewer

Uses a simple, low-friction experience to review the actual website, leave contextual feedback, track relevant progress, review outstanding concerns, and approve a particular release or request further changes. A client reviewer should not need to learn a developer-oriented task board.

These experiences are intentionally different: the agency needs operational detail, while the client needs clarity and confidence.

## The End-to-End Product Experience

1. **Set up a website project.** An agency creates an organization/workspace and a project for a client website. The project can have environments such as staging or production, and identifiable deployment versions.
2. **Enable contextual feedback.** The agency installs Pinforth's lightweight, embeddable website feedback widget on an approved staging website.
3. **Start a review round.** The team defines what is being reviewed, the candidate deployment, review instructions, and any relevant checklist. A client or tester receives a scoped invitation or review link.
4. **Collect feedback on the real website.** The reviewer opens the staging site, selects an element or an area, and submits a comment. Pinforth captures useful context such as the page URL, an element locator, viewport information, and optional screenshots or attachments.
5. **Turn feedback into manageable issues.** The agency reviews incoming feedback, classifies or prioritizes it, adds reproduction details, assigns responsibility, and discusses it with the relevant people. AI may suggest clearer descriptions or acceptance criteria, subject to human review.
6. **Submit a fix.** A developer changes the website and records the fix against the relevant updated deployment or release candidate. A claim that a fix is complete is not the same as QA verification.
7. **Retest the exact deployment.** QA compares the original report and available evidence with the candidate deployment, actually retests the reported behavior, and records a pass or failure. A failed fix can be reopened and corrected again without erasing previous attempts.
8. **Evaluate release readiness.** The team sees outstanding blockers, verification results, checklist completion, and what still requires attention before approval can be requested.
9. **Obtain client sign-off.** The client sees an understandable release summary and either approves that particular deployment or requests changes. The decision, actor, time, and scope are recorded.
10. **Preserve history when the website changes.** If a new deployment is introduced, the previous verification and approval records remain historical; they do not silently become approval of the new version.

Pinforth does not bypass the staging website's own authentication. A review invitation grants access to Pinforth's scoped review experience, not automatic access to a separately protected website.

## Main Product Experiences

### Agency workspace and dashboard

A central place to manage organizations, team memberships, projects, website environments, reviewers, current review rounds, open issues, blockers, pending verification, and releases awaiting approval.

### Embeddable website feedback widget

A lightweight JavaScript widget that runs inside a website being reviewed. It lets a reviewer enter feedback mode, select an element or area, write a comment, optionally attach evidence, submit feedback, and receive acknowledgement. The website should remain usable when feedback mode is not active.

Visual feedback includes context such as the URL, possible element selectors, viewport and scroll position, and browser information. Screenshots are useful but may be imperfect or unavailable on some pages; a valid report must not depend on automatic screenshot capture.

### Review rounds and invitations

A review round groups a deliberate website review cycle: its instructions, reviewer access, checklist, issues, candidate deployment, progress, and outcome. Guest access is limited to what the invitation permits and is distinct from becoming a member of the agency's workspace.

### Issue tracking and collaboration

Each issue is a traceable record of feedback or a problem. It can have a type, severity or priority, assignment, status, page/element anchor, comments, attachments, and history. Team members may need internal discussion that is not visible to client reviewers.

### Fix submission and QA verification

A developer can submit a fix for a particular deployment. QA can examine the original issue and evidence, retest on that version, and record the outcome. Multiple fix submissions and verification attempts may exist for the same issue. A failed attempt remains part of the history.

### Release readiness and client approval

The release view explains which deployment is the approval candidate, what has been verified, which blockers remain, and what the client is being asked to approve. Approval is an explicit decision about a specific release, not a generic “project complete” flag.

## Core Product Concepts

| Concept | Meaning in Pinforth |
| --- | --- |
| **Organization / Workspace** | The agency or team boundary that owns projects and controls membership. |
| **Membership / Role** | A person's authorized relationship to an organization or project. |
| **Project** | A client website and its associated review activity. |
| **Environment** | A website location or context, such as a staging environment. |
| **Deployment** | An identifiable version or release candidate of a website. |
| **Review round** | A bounded review cycle with reviewers, instructions, scope, and a candidate deployment. |
| **Guest reviewer** | An invited participant with limited review permissions, not necessarily an organization member. |
| **Issue** | A trackable item created from feedback or testing. |
| **Issue anchor / evidence** | The page, selected element, screenshot, metadata, or attachment that explains the report. |
| **Fix submission** | A developer's record of a proposed fix and the deployment containing it. |
| **Verification** | A QA result documenting what was retested on which deployment. |
| **Release readiness** | A view of remaining blockers, verification outcomes, and approval prerequisites. |
| **Approval** | A recorded client decision to accept or request changes to a specific deployment. |
| **Audit history** | The durable record of important actions, decisions, and changes. |

## Essential Product Rules

These distinctions define Pinforth's identity:

1. **Reported is not fixed.** An issue being created or assigned does not mean it has been resolved.
2. **Fixed is not verified.** A developer marking work complete does not mean an independent reviewer has confirmed the behavior.
3. **Verified is not client-approved.** QA verification and client sign-off are separate decisions made by the appropriate people.
4. **Verification belongs to a deployment.** A successful test on deployment A is not proof that deployment B works.
5. **Approval belongs to a deployment.** Approving release A does not automatically approve release B, even if B is newer.
6. **Failed attempts remain visible.** Reopened issues and repeated fixes must preserve their past submissions, evidence, and verification results.
7. **Release blockers matter.** The readiness experience should not present unresolved blocking issues as approved or cleared without an authorized, traceable decision.
8. **Organization and project boundaries matter.** One agency must not see another agency's private projects or data. Guest reviewers see only their permitted review content.
9. **Client-visible and internal content differ.** Internal notes or sensitive evidence must not automatically become visible to clients.
10. **An approval is an auditable human decision.** It records who approved what and when; it must not be silently inferred from an issue status or an AI suggestion.

An illustrative issue lifecycle is **New → Triaged → In Progress → Ready for Verification → Verified → Closed**, with pathways for **Reopened** and **Deferred** issues. The important product meaning is that transitions reflect distinct real-world actions, not merely cosmetic labels.

## The Role of AI

Pinforth is **AI-assisted, not AI-controlled**.

AI can help transform rough client feedback into clearer issue titles, summaries, reproduction questions, and acceptance criteria. It may also help identify possible duplicates or related reports. Suggested text must remain distinguishable from observed evidence and editable by a human.

AI does not inherently know whether a bug has been reproduced, whether a fix actually works, whether a deployment is correct, or whether a client has approved it. Such claims require real evidence and the appropriate human action.

AI-assisted coding-agent integration, including possible MCP access, is a product extension: authorized agents could retrieve permitted issues or propose updates, while access remains scoped and sensitive decisions remain controlled and auditable. A coding agent is not a substitute for QA verification or client approval.

## Product Boundaries and Potential Extensions

Pinforth's core purpose is the website review-to-sign-off workflow. It is **not** a general-purpose bug tracker, a full software project-management suite, a website builder, a complete automated testing product, a screen-recording suite, or an autonomous code-fixing service.

Possible extensions include GitHub and deployment-provider integrations, automatic deployment references, richer AI issue clarification, MCP interfaces for development agents, controlled automated browser checks, additional integrations, and more detailed review analytics. These extend the central review workflow rather than replace it.

The product does not depend on automatic code discovery, perfect screenshots, or automatic QA in order to deliver its primary value.

## Product Experience Principles

- **Client-friendly by default:** reviewers should understand what is happening without software-engineering terminology.
- **Context with minimal effort:** collect useful page and browser information so clients can focus on describing the problem.
- **Visible progress:** make it clear what is new, being fixed, waiting for retest, verified, or awaiting approval.
- **Evidence over assertions:** a status label alone should not imply that a fix was retested or a release was approved.
- **Low-friction feedback:** support straightforward feedback even when element selection or screenshot capture fails.
- **Accessibility and responsiveness:** review and approval should work for people using keyboards and smaller screens.
- **Privacy and scoped access:** staging-site content, screenshots, guest links, comments, and attachments may be sensitive.
- **Clear separation of perspectives:** clients see a straightforward review and sign-off experience; the agency sees detailed operational workflows.

## What Success Looks Like

A client can open an invited staging review, point to a real problem, and submit useful feedback without complex onboarding. A developer receives enough context to act. QA can demonstrate what was actually retested against a specific deployment. The project manager can see remaining blockers. Finally, the client can approve the exact version they reviewed, with a durable record of that decision.

**Pinforth exists to make that complete journey understandable, traceable, and trustworthy—from feedback to sign-off.**
