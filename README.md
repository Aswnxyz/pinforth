# Pinforth

**From feedback to sign-off.**

Pinforth is an AI-assisted website feedback, issue tracking, QA verification, and client approval platform designed for web development agencies, freelancers, developers, testers, and their clients.

It aims to simplify the complete website review and delivery process—from collecting visual feedback to verifying fixes and approving releases.

> **Project Status:** Early Development — Monorepo Foundation

## The Problem

Website feedback is often scattered across emails, messaging platforms, screenshots, and project management tools.

This makes it difficult to track reported problems, communicate with clients, verify fixes, and determine whether a website is ready for delivery.

## Our Solution

Pinforth aims to bring the entire workflow into one collaborative platform:

**Visual Feedback → Issue Management → AI Assistance → Developer Fix → QA Verification → Client Approval**

The key focus is not just reporting bugs, but ensuring that reported issues are resolved, verified, and approved before delivery.

## Planned Features

### Visual Website Feedback
- Lightweight, embeddable JavaScript feedback widget.
- Element-based feedback pins and annotations.
- Screenshot attachments and browser metadata.
- Guest review links for clients.

### Project & Issue Management
- Multi-project agency workspaces.
- Role-based access for developers, testers, managers, and clients.
- Issue assignment, prioritization, comments, and status tracking.
- Review rounds and progress tracking.

### AI-Assisted Workflows
- Convert client feedback into structured issue reports.
- Suggest issue descriptions and acceptance criteria.
- Identify potential duplicate feedback.
- Future integration with AI coding agents through MCP.

### Fix Verification & Approval
- Track fixes against website deployment versions.
- Compare original and updated evidence.
- QA verification and issue reopening.
- Client review and release approval.
- Delivery history and approval records.

**Note:** These capabilities represent the product roadmap and are not yet implemented.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Backend | Node.js, Express.js 5, TypeScript |
| Database (planned) | PostgreSQL, Prisma |
| Validation | Zod |
| Package Management | pnpm Workspaces |
| Background Processing (planned) | Redis, BullMQ |
| AI Integration (planned) | LLM APIs |
| Testing (planned) | Vitest, Playwright |

The project uses a **TypeScript monorepo** managed with pnpm workspaces. Turborepo is not currently part of the setup.

## Project Structure

```text
pinforth/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # Express.js backend
│
├── packages/
│   └── shared/              # Shared types and validation schemas
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

Additional packages, including the embeddable feedback SDK and background workers, will be introduced as development progresses.

## Getting Started

### Prerequisites

- Node.js 24
- pnpm 12.14.0
- Git

### Clone the repository

```bash
git clone https://github.com/Aswnxyz/pinforth.git
cd pinforth
```

### Install dependencies

```bash
pnpm install
```

If pnpm requests build-script approval, review the dependencies before running `pnpm approve-builds`.

### Start development servers

```bash
pnpm dev
```

This builds the shared package and starts the frontend and backend concurrently.

| Service | Local URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4000 |
| API Health Check | http://localhost:4000/api/v1/health |

### Available Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start frontend and backend |
| `pnpm dev:web` | Start Next.js frontend |
| `pnpm dev:api` | Start Express backend |
| `pnpm build:shared` | Build shared TypeScript package |
| `pnpm build` | Build all workspace packages |
| `pnpm lint` | Run frontend ESLint |

When running individual applications, build the shared package first. Changes to shared package source may require rebuilding it during development.

## Development Status

**Completed**
- pnpm monorepo initialization.
- Next.js frontend scaffold.
- Express.js backend scaffold.
- Shared TypeScript and Zod package.
- Root development and build scripts.
- Initial production build verification.

**Upcoming**
- PostgreSQL database integration.
- Authentication and workspace management.
- Organization and project management.
- Embeddable website feedback SDK.
- Issue tracking and collaboration.
- Fix verification and client approval workflows.
- AI-assisted feedback processing.

The current repository provides the application foundation. Core product features are under development.

## Collaboration Workflow

Pinforth is being developed collaboratively using GitHub.

Our workflow follows a feature-branch approach:

1. Create a branch from the latest `main`.
2. Implement a focused feature or improvement.
3. Commit and push changes.
4. Open a Pull Request.
5. Request a teammate review.
6. Merge after successful review and verification.

Branch naming examples:

- `feat/authentication`
- `feat/project-dashboard`
- `feat/feedback-widget`
- `fix/issue-validation`
- `chore/monorepo-scaffold`

Direct development commits to `main` are discouraged.

## Security

Do not commit environment secrets, credentials, API keys, or sensitive client data.

Use environment example files for documenting required configuration. Authentication, authorization, tenant isolation, secure review links, and privacy safeguards will be implemented as the application develops.

## Project Goal

Pinforth is a collaborative full-stack engineering project intended to explore real-world SaaS architecture, modern frontend development, API design, secure collaboration, visual website tooling, and useful AI integrations.

Our objective is to build a practical and reliable product with a strong focus on usability and engineering quality.

---

**Pinforth — From feedback to sign-off.**