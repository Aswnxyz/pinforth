# Pinforth

**From feedback to sign-off.**

Pinforth is an AI-assisted website feedback, issue tracking, QA verification, and client approval platform designed for web development agencies, freelancers, developers, testers, and their clients.

It aims to simplify the complete website review and delivery process—from collecting visual feedback to verifying fixes and approving releases.

> **Project Status:** Early Development — Database Foundation

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
| Database | PostgreSQL 17, Prisma ORM 7 || Validation | Zod |
| Package Management | pnpm Workspaces |
| Background Processing (planned) | Redis, BullMQ |
| AI Integration (planned) | LLM APIs |
| Testing (planned) | Vitest, Playwright |

The project uses a **TypeScript monorepo** managed with pnpm workspaces. Turborepo is not currently part of the setup.

## Project Structure

```text
pinforth/
├── apps/
│   ├── web/                    # Next.js frontend
│   └── api/                    # Express.js backend
│       ├── prisma/
│       │   ├── schema.prisma   # Database models
│       │   └── migrations/    # Versioned SQL migrations
│       ├── src/
│       │   ├── lib/
│       │   │   └── prisma.ts  # Prisma Client instance
│       │   └── scripts/
│       │       └── check-db.ts
│       └── prisma.config.ts
│
├── packages/
│   └── shared/                 # Shared types and Zod schemas
│
├── docker-compose.yml         # Local PostgreSQL
├── .env.example
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
- Docker Desktop (or Docker Engine with Compose v2.17+)

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

### Local database

PostgreSQL 17 runs in Docker. Data is kept in the `pinforth_pgdata` volume, so it survives restarts and `pnpm db:down`.

Create your local env file once (`.env` is git-ignored):

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Then:

| Command | Description |
|---|---|
| `pnpm db:up` | Start PostgreSQL and wait until it is healthy |
| `pnpm db:status` | Show container status and health |
| `pnpm db:logs` | Follow database logs |
| `pnpm db:psql` | Open a `psql` shell in the database |
| `pnpm db:down` | Stop the database (data is kept) |
| `pnpm db:reset` | **Delete all local data** and start fresh |

The database listens on `localhost:5432`; connect using `DATABASE_URL` from `.env`. If port 5432 is already in use, change `POSTGRES_PORT` and the port in `DATABASE_URL`.

Credentials are read only when the volume is first created. After changing `POSTGRES_USER`, `POSTGRES_PASSWORD` or `POSTGRES_DB`, run `pnpm db:reset`.

### Prisma Database Setup

Pinforth uses Prisma ORM with PostgreSQL for type-safe database access.

Prisma is configured inside `apps/api`, while PostgreSQL runs through Docker Compose.

After starting PostgreSQL with `pnpm db:up`, apply the existing database migrations:

```bash
pnpm --filter @pinforth/api exec prisma migrate deploy
```

Generate Prisma Client:

```bash
pnpm --filter @pinforth/api exec prisma generate
```

Verify the database connection:

```bash
pnpm --filter @pinforth/api exec tsx src/scripts/check-db.ts
```

Check migration status:

```bash
pnpm --filter @pinforth/api exec prisma migrate status
```

#### Database Development Commands

| Command | Description |
|---|---|
| `prisma migrate dev --name <name>` | Create and apply a development migration |
| `prisma migrate deploy` | Apply existing committed migrations |
| `prisma generate` | Generate the type-safe Prisma Client |
| `prisma migrate status` | Check the database migration status |
| `prisma validate` | Validate the Prisma schema |
| `prisma studio` | Open Prisma's database browser |

Run Prisma commands from the API workspace, for example:

```bash
pnpm --filter @pinforth/api exec prisma studio
```

The database schema is maintained in `apps/api/prisma/schema.prisma`.

Commit Prisma schema and migration files to Git. Generated Prisma Client files are excluded from version control.

Each developer should configure their own root `.env` file using `.env.example`. If the default PostgreSQL port `5432` is occupied, update both `POSTGRES_PORT` and `DATABASE_URL` in the local `.env`.

**Warning:** `pnpm db:reset` deletes all data in the local PostgreSQL volume. Use it only when intentionally resetting the local development database.

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
| `pnpm lint:web` | Run frontend ESLint |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL |

When running individual applications, build the shared package first. Changes to shared package source may require rebuilding it during development.

## Development Status

**Completed**
- pnpm monorepo initialization.
- Next.js frontend scaffold.
- Express.js backend scaffold.
- Shared TypeScript and Zod package.
- Root development and build scripts.
- PostgreSQL 17 local development environment using Docker Compose.
- Prisma ORM 7 integration with PostgreSQL.
- Initial database models:
  - User
  - Organization
  - OrganizationMember
  - Project
  - Environment
- Initial Prisma database migration.
- Prisma Client integration using the PostgreSQL driver adapter.
- Database connectivity verification with compiled JavaScript.

**Upcoming**
- Authentication and authorization.
- Organization and membership management.
- Project management APIs.
- Deployment version tracking.
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