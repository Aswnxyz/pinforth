# Pinforth

**From feedback to sign-off.**

Pinforth is an AI-assisted website feedback, issue tracking, QA verification, and client approval platform designed for web development agencies, freelancers, developers, testers, and their clients.

It aims to simplify the complete website review and delivery process—from collecting visual feedback to verifying fixes and approving releases.

> **Project Status:** Active Development — Visual Feedback, Guest Reviews & Issue Management Foundation

## The Problem

Website feedback is often scattered across emails, messaging platforms, screenshots, and project management tools.

This makes it difficult to track reported problems, communicate with clients, verify fixes, and determine whether a website is ready for delivery.

## Our Solution

Pinforth brings the review and delivery workflow into one collaborative platform:

**Visual Feedback → Issue Management → AI Assistance → Developer Fix → QA Verification → Client Approval**

The key focus is not just reporting bugs, but ensuring that reported issues are resolved, independently retested on candidate deployments, and approved before delivery.

## Current Capabilities

### Workspace & Project Management
- Multi-project agency workspaces with tenant isolation.
- Role-based access control (`OWNER`, `ADMIN`, `MEMBER`).
- Organization team member management with last-owner protection.
- Email invitations with token validation and expiration.
- Project environments (e.g. staging, preview) with URL validation.

### Review Rounds & Scoped Guest Access
- Review rounds linked to candidate website environments.
- Guest review links with secret token conveyance via URL fragments (`#token=...`) to prevent server-side secret leakage.
- Single-use handoff codes (`#pf_handoff=...`) exchanged via Pinforth web for short-lived (4-hour) widget session tokens.
- Safe for modern browser privacy defaults (no third-party cookies required).

### Embeddable Feedback Widget (`@pinforth/widget`)
- Lightweight, zero-dependency browser script bundled as an IIFE (under 30 KB budget).
- Interactive element selection with automated CSS selector capture (`@medv/finder`).
- Captures viewport dimensions, scroll positions, and browser metadata.
- Submits feedback directly to the Pinforth API using bearer session tokens and client idempotency keys.

### Issue Tracking & Guest Attribution
- Concurrency-safe sequential issue numbering per project (`#1`, `#2`, `#3`).
- Issue classification by type (`BUG`, `DESIGN`, `CONTENT`, `SUGGESTION`) and priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- Lifecycle status tracking (`NEW`, `IN_PROGRESS`, `READY_FOR_VERIFICATION`, `CLOSED`).
- Attribution to registered agency members or guest reviewers (`guestName`, `guestEmail`, `guestLinkId`, `reviewRoundId`).
- Filtered search, assignee filters (`me`, `unassigned`, specific UUID), and real-time status counts.

## Planned Roadmap

### Fix Verification & Retesting
- Developer fix submissions linked to identifiable website deployments.
- Independent QA verification on target candidate deployments.
- Full audit history preserving previous verification attempts and reopens.

### Release Readiness & Client Sign-Off
- Release readiness view tracking unresolved blockers and QA verification status.
- Scoped client release approval experience with auditable sign-off records.
- Deployment immutability: approving deployment A never implicitly approves deployment B.

### AI-Assisted Workflows
- Clarify unstructured client feedback into reproducible issues and acceptance criteria.
- Duplicate and related report detection.
- Scoped MCP server integration for developer coding agents.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Backend | Node.js, Express.js 5, JavaScript (ES modules) |
| Database | PostgreSQL 17, Prisma ORM 7 |
| Validation | Zod |
| Feedback Widget | Vanilla TypeScript, esbuild (IIFE bundle) |
| Package Management | pnpm Workspaces |
| Continuous Integration | GitHub Actions |
| Background Processing (planned) | Redis, BullMQ |
| AI Integration (planned) | LLM APIs |
| Testing | Vitest, Supertest (API), Happy DOM (Widget) |

The project is a pnpm workspaces monorepo. The frontend (`apps/web`), feedback widget (`packages/widget`), and shared package (`packages/shared`) use TypeScript; the backend (`apps/api`) is plain JavaScript (ES modules) and runs directly on Node.js with no build step.

## Project Structure

```text
pinforth/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI validation workflow
├── apps/
│   ├── web/                   # Next.js frontend
│   └── api/                   # Express.js backend
│       ├── prisma/
│       │   ├── schema.prisma  # Database models
│       │   └── migrations/    # Versioned SQL migrations
│       ├── src/
│       │   ├── config/
│       │   │   └── env.js     # Validated environment variables
│       │   ├── lib/
│       │   │   ├── errors.js  # AppError and HTTP error helpers
│       │   │   └── prisma.js  # Prisma Client instance
│       │   ├── middleware/    # Auth, org roles, error handlers
│       │   ├── modules/
│       │   │   ├── auth/          # Authentication & sessions
│       │   │   ├── guest/         # Guest review link exchange & handoffs
│       │   │   ├── invitations/   # Organization invites
│       │   │   ├── issues/        # Issue tracking & guest attribution
│       │   │   ├── organizations/ # Workspace & team management
│       │   │   ├── projects/      # Projects & environments
│       │   │   ├── review-rounds/ # Review rounds & guest links
│       │   │   └── widget/        # Widget session & feedback endpoints
│       │   └── scripts/
│       │       └── check-db.js
│       ├── test/              # Vitest & Supertest API integration tests
│       ├── prisma.config.js
│       └── vitest.config.js
│
├── packages/
│   ├── shared/                # Shared types and Zod schemas
│   └── widget/                # Embeddable website feedback widget
│
├── docs/                      # Architectural contracts and design briefs
├── docker-compose.yml         # Local PostgreSQL and Mailpit
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

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

PostgreSQL 17 runs in Docker. Data is kept in the `pgdata` volume, so it survives restarts and `pnpm db:down`.

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
pnpm --filter @pinforth/api db:check
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

### Start development servers

```bash
pnpm dev
```

This builds the shared package and starts the frontend and backend concurrently.

| Service | Local URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4000 |
| Feedback Widget Demo | http://localhost:5500 (`pnpm dev:widget`) |
| API Health Check | http://localhost:4000/api/v1/health |

### Available Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start frontend and backend concurrently |
| `pnpm dev:web` | Build shared/widget and start Next.js frontend |
| `pnpm dev:api` | Build shared and start Express backend |
| `pnpm dev:widget` | Build widget in watch mode and serve the local demo site |
| `pnpm build` | Build all workspace packages (`shared`, `api`, `widget`, `web`) |
| `pnpm build:shared` | Build shared TypeScript package |
| `pnpm build:widget` | Bundle feedback widget (`dist/` and `apps/web/public/widget/v1.js`) |
| `pnpm build:api` | Generate Prisma Client |
| `pnpm build:web` | Build Next.js production bundle |
| `pnpm lint:web` | Run Next.js ESLint on the frontend |
| `pnpm typecheck:shared` | Type-check shared TypeScript package |
| `pnpm --filter @pinforth/widget typecheck` | Type-check feedback widget package |
| `pnpm test:web` | Run Next.js frontend unit tests with Vitest |
| `pnpm test:widget` | Run feedback widget tests with Vitest and Happy DOM |
| `pnpm test:api` | Run API integration tests against the isolated test database |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL in Docker |
| `pnpm db:status` / `pnpm db:logs` | Check container health / follow logs |
| `pnpm db:psql` | Open a `psql` shell in the database container |
| `pnpm db:reset` | Reset PostgreSQL container volume and start fresh |
| `pnpm mail:up` / `pnpm mail:down` | Start / stop local Mailpit SMTP server |

When running individual applications, build the shared package first. Changes to shared package source may require rebuilding it during development.

### Running tests

Pinforth includes dedicated test suites for the web frontend, feedback widget, and backend API:

```bash
# Run web unit tests
pnpm test:web

# Run feedback widget tests
pnpm test:widget

# Run API integration tests (requires PostgreSQL running via pnpm db:up)
pnpm test:api
```

#### API Test Database Isolation

API tests use Vitest and Supertest against a separate `<database>_test` database (for example `pinforth_test`), so development data is never touched.

- The global setup connects to the PostgreSQL administrative database (`postgres`), checks if the test database exists, and creates it if not.
- All committed migrations are deployed automatically using `prisma migrate deploy`.
- Application tables are truncated between tests while migration history is preserved.
- Safety check: API tests refuse to run against any database whose name does not end in `_test`.
- Set `TEST_DATABASE_URL` in `.env` or the environment to override the test database URL.

#### Static Verification

```bash
# Lint web application
pnpm lint:web

# Typecheck packages
pnpm typecheck:shared
pnpm --filter @pinforth/widget typecheck
```

## Continuous Integration

Every pull request targeting `main` and pushes to `main` are automatically validated by GitHub Actions (`.github/workflows/ci.yml`).

### Workflow Pipeline

The CI workflow executes the following pipeline:

1. **Dependency Installation:** `pnpm install --frozen-lockfile` with cached pnpm store.
2. **Web Linting:** `pnpm lint:web` via ESLint.
3. **Type Checking:** `pnpm typecheck:shared` and `pnpm --filter @pinforth/widget typecheck`.
4. **Web Tests:** `pnpm test:web` with Vitest.
5. **Widget Tests:** `pnpm test:widget` with Vitest and Happy DOM.
6. **Prisma Schema Validation:** `pnpm --filter @pinforth/api exec prisma validate`.
7. **API Tests & Database Migrations:** `pnpm test:api` against a disposable PostgreSQL 17 service container. The global test setup automatically provisions an isolated `_test` database and verifies that all committed migrations deploy successfully.
8. **Monorepo Build:** `pnpm build` across shared, API, widget, and web workspaces.

### Database Isolation in CI

The CI job runs an ephemeral PostgreSQL 17 service container with health checks (`pg_isready`). The workflow provides:
- `DATABASE_URL`: points to a disposable base database (`pinforth_ci_base`).
- `TEST_DATABASE_URL`: points to an isolated test database ending in `_test` (`pinforth_ci_test`).

The test runner provisions `pinforth_ci_test`, deploys migrations to it, and runs tests against it, keeping the base database untouched.

### Branch Protection Check Name

When configuring GitHub branch protection rules for `main`, require the status check named:
- **`Validate`**

## API Environment

The API validates its environment on startup and exits with a clear message if anything is missing or invalid.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `PORT` | `4000` | API port |
| `WEB_ORIGIN` | `http://localhost:3000` | Comma-separated origins allowed to call the API with cookies |
| `JWT_ACCESS_SECRET` | (required) | Access-token signing key, at least 32 characters. Generate one per environment (see `.env.example`) |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime (15 minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh session lifetime, renewed on each refresh |
| `COOKIE_DOMAIN` | (unset) | Production only, e.g. `.pinforth.com` so `app.` and `api.` share auth cookies |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the API, for correct client IPs in rate limiting |
| `AUTH_RATE_LIMIT` | `true` | Set `false` to disable auth rate limits (tests only) |
| `APP_URL` | `http://localhost:3000` | Public web app URL, used for links in emails |
| `MAIL_FROM` | `Pinforth <no-reply@pinforth.local>` | Sender address |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | SMTP server. The defaults point at Mailpit |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465) |
| `SMTP_USER` / `SMTP_PASS` | (unset) | SMTP credentials, if your provider needs them |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | Reset link lifetime |
| `EMAIL_VERIFY_TTL_HOURS` | `24` | Email verification link lifetime |
| `INVITATION_TTL_DAYS` | `7` | Organization invite link lifetime |

### Local email

In development, the API sends email to [Mailpit](https://mailpit.axllent.org/), which catches every message instead of delivering it:

```bash
pnpm mail:up      # then open http://localhost:8025
pnpm mail:down
```

Tests don't use SMTP; they capture messages in memory.

## API Reference

### Authentication API

Base path: `/api/v1/auth`. Auth uses two `httpOnly`, `SameSite=Lax` cookies:

- `pf_access`: a 15-minute signed JWT, sent to `/api`.
- `pf_refresh`: an opaque 30-day token, sent only to `/api/v1/auth`. It is rotated on every refresh and stored only as a SHA-256 hash.

| Endpoint | Auth | Description |
|---|---|---|
| `POST /signup` | none | `{ email, password, name? }`. Creates the account and signs in. `409` if the email exists |
| `POST /login` | none | `{ email, password }`. Same `401 INVALID_CREDENTIALS` for an unknown email or a wrong password |
| `POST /refresh` | refresh cookie | Issues new tokens. Replaying an already-used refresh token signs out that whole login |
| `POST /logout` | refresh cookie | Ends the current login. Always succeeds |
| `POST /logout-all` | access | Ends every login for the user |
| `GET /me` | access | Current user and organization memberships |
| `POST /forgot-password` | none | `{ email }`. Emails a single-use reset link (30 min). The response is identical whether or not the account exists |
| `POST /reset-password` | none | `{ token, password }`. Sets the new password, verifies the email, signs out every device and sends a confirmation email. Does not sign the user in |
| `POST /verify-email` | none | `{ token }`. Confirms the email from the link sent at signup. Works on any device without signing in |
| `POST /resend-verification` | access | Sends a new link and invalidates the old one. Returns `{ alreadyVerified: true }` (200) if there is nothing to do. Limited to 3 per hour |

### Organizations API

Base path: `/api/v1/organizations`. Every route requires authentication.

| Endpoint | Role | Description |
|---|---|---|
| `POST /` | any user | `{ name, slug? }`. Creates the organization with the caller as `OWNER`. The slug is derived from the name if omitted; a derived slug that's taken gets a short suffix |
| `GET /` | any user | The caller's organizations, with their role in each |
| `GET /:orgId` | member | Organization details and the caller's role |
| `PATCH /:orgId` | `OWNER`, `ADMIN` | `{ name }`. Renames the organization. The slug can't be changed |
| `GET /:orgId/members` | member | Members, with their roles and join dates |

### Members API

Base path: `/api/v1/organizations/:orgId/members`. Every route requires authentication and organization membership.

| Endpoint | Who | Description |
|---|---|---|
| `GET /` | member | Members, oldest first. Each is `{ id, role, joinedAt, user { id, name, email }, isYou }` |
| `PATCH /:memberId` | `OWNER` | `{ role }` (`OWNER`, `ADMIN` or `MEMBER`). Returns `{ member }` |
| `DELETE /:memberId` | see below | Removes a member. Use your own member `id` to leave |

- Anyone can remove **themselves** (leave).
- An `OWNER` can remove anyone.
- An `ADMIN` can remove `MEMBER`s only.
- Demoting, removing, or leaving as the organization's last `OWNER` returns `409 LAST_OWNER`.

### Projects and Environments API

Base path: `/api/v1/organizations/:orgId/projects`. Every route requires authentication and organization membership.

| Endpoint | Role | Returns |
|---|---|---|
| `POST /` | `OWNER`, `ADMIN` | `{ project: ProjectSummary }` (201). Body: `{ name, description? }` |
| `GET /` | member | `{ projects: ProjectSummary[] }`, newest first |
| `GET /:projectSlug` | member | `{ project: ProjectDetail }`: the summary plus `environments`, oldest first |
| `PATCH /:projectSlug` | `OWNER`, `ADMIN` | `{ project: ProjectSummary }`. Body: `{ name?, description? }` |
| `POST /:projectSlug/environments` | `OWNER`, `ADMIN` | `{ environment: Environment }` (201). Body: `{ name, url }` |
| `PATCH /:projectSlug/environments/:environmentId` | `OWNER`, `ADMIN` | `{ environment: Environment }`. Body: `{ name?, url? }` |

### Review Rounds API

Base path: `/api/v1/organizations/:orgId/projects/:projectSlug/review-rounds`. Every route requires authentication and organization membership.

| Endpoint | Role | Description |
|---|---|---|
| `POST /` | `OWNER`, `ADMIN` | Create review round. Body: `{ environmentId, title, instructions?, checklist? }` |
| `GET /` | member | List review rounds for project. Filterable with `?status=OPEN` or `CLOSED` |
| `POST /:roundId/guest-links` | `OWNER`, `ADMIN` | Generate a guest review link. Body: `{ label?, expiresAt? }`. Returns the secret link token (only returned once) |
| `DELETE /:roundId/guest-links/:linkId` | `OWNER`, `ADMIN` | Revoke a guest access link |

### Guest Reviews API

Base path: `/api/v1/guest`. Public endpoints for invited reviewers.

| Endpoint | Auth | Description |
|---|---|---|
| `POST /reviews/exchange` | none (rate-limited) | `{ token }`. Validates the guest invitation secret, checks review round status and origin match, and returns a single-use handoff code and staging target URL |

### Feedback Widget API

Base path: `/api/v1/widget`. CORS-enabled endpoints called by the embedded feedback widget on review websites.

| Endpoint | Auth | Description |
|---|---|---|
| `POST /sessions/exchange` | none (rate-limited) | `{ handoffCode }`. Consumes the single-use handoff code and returns a 4-hour Bearer session token (`sessionToken`) |
| `POST /issues` | Bearer session token | Submit contextual feedback issue from staging website. Body: `{ title, description?, type?, priority?, pageUrl, selector?, viewport?, scrollPosition?, clientMutationId? }` |

### Issues API

Base path: `/api/v1/organizations/:orgId/projects/:projectSlug/issues`. Every route requires authentication and organization membership.

| Endpoint | Role | Returns | Description |
|---|---|---|---|
| `POST /` | member (verified email) | `{ issue: IssueDetail }` (201) | Create issue from dashboard. Body: `{ title, description?, type?, priority?, assigneeId?, environmentId? }` |
| `GET /` | member | `{ issues: IssueSummary[], pagination, counts }` (200) | Paginated list, filtered search, and status counts |
| `GET /:number` | member | `{ issue: IssueDetail }` (200) | Single issue detail by sequential number |
| `PATCH /:number` | member | `{ issue: IssueDetail }` (200) | Update issue. Body: `{ title?, description?, type?, priority?, status?, assigneeId?, environmentId? }` |
| `DELETE /:number` | `OWNER`, `ADMIN` | `{ deleted: true, number }` (200) | Delete issue. Numbers are never reused |

- **Issue Types:** `BUG` (default), `DESIGN`, `CONTENT`, `SUGGESTION`.
- **Issue Priorities:** `LOW`, `MEDIUM` (default), `HIGH`, `CRITICAL`.
- **Issue Statuses:** `NEW` (default on create), `IN_PROGRESS`, `READY_FOR_VERIFICATION`, `CLOSED`.
- **Issue Sources:** `DASHBOARD` (dashboard submission), `WIDGET` (embedded widget submission).
- **Guest Attribution:** Issues created via the widget have `source: WIDGET`, `reporterId: null`, and record `guestName`, `guestEmail`, `guestLinkId`, `reviewRoundId`, `pageUrl`, and `context` (element selector, viewport, and scroll information).
- **Sequential Issue Numbering:** Atomic increment starting at 1 per project. Permanent and never reused after deletion.
- **Listing & Status Counts:** Number-descending pagination (`page`, `limit`), filtered by `status`, `type`, `priority`, `assigneeId` (`me`, `unassigned`, or UUID), `environmentId`, and substring `search`.

### Invitations API

**Organization side:** `/api/v1/organizations/:orgId/invitations`, for `OWNER` and `ADMIN` only.

| Endpoint | Description |
|---|---|
| `POST /` | `{ email, role? }`. `role` is `ADMIN` or `MEMBER` (default `MEMBER`). Emails an invite link valid for 7 days. Inviter needs a verified email |
| `GET /` | Open invites (`pending` or `expired`), newest first |
| `POST /:invitationId/resend` | New link and new 7-day expiry. The old link stops working. Limited to 3 per invite per hour |
| `DELETE /:invitationId` | Revokes the invite. Row kept as history |

**Invite link side:** `/api/v1/invitations`

| Endpoint | Auth | Description |
|---|---|---|
| `GET /:token` | none | Preview for the invite page: `{ organization { name, slug }, email, role, invitedBy { name } | null, expiresAt }` |
| `POST /accept` | access | `{ token }`. Joins the organization and returns `{ organization { id, name, slug, role } }`. Safe to repeat |

## Development Status

**Completed**
- pnpm monorepo architecture and workspaces configuration.
- Next.js frontend with Tailwind CSS 4, authenticated dashboard, and review UI.
- Express.js backend with ES modules, validated environment config, security headers, and credentialed CORS.
- Shared TypeScript and Zod package (`@pinforth/shared`).
- Embeddable feedback widget (`@pinforth/widget`) with element selector, viewport, and scroll capture.
- PostgreSQL 17 local development environment using Docker Compose.
- Prisma ORM 7 integration with PostgreSQL adapter and versioned migrations.
- Authentication: signup, login, rotating refresh sessions with reuse detection, logout, logout-all, password reset by email, email verification, and rate limiting.
- Organizations & team management: create, rename, list members, role promotion, member removal, and last-owner protection.
- Projects & website environments: create, list, view, update, with generated slugs and environment URL configuration.
- Review rounds: creation linked to website environments, open/closed status tracking.
- Scoped guest review access: secret token generation, URL fragment transmission, single-use handoffs, and short-lived widget sessions.
- Issue management: concurrency-safe sequential issue numbering, role-based access, filtering, assigned-to-me support, status tab counts, and guest attribution.
- Full test suite: Next.js unit tests (`pnpm test:web`), feedback widget tests (`pnpm test:widget`), and API integration tests against an isolated PostgreSQL database (`pnpm test:api`).
- Automated CI pipeline: GitHub Actions workflow (`.github/workflows/ci.yml`) validating linting, types, unit/DOM tests, Prisma schema, migration deployment, API tests, and monorepo build on every PR to `main`.

**Upcoming**
- Deployment version tracking & release candidate linking.
- Developer fix submission linked to specific deployments.
- Independent QA verification and issue reopening workflows.
- Release readiness assessment & blocker tracking.
- Scoped client release sign-off & auditable approval records.
- AI-assisted feedback clarification, reproduction steps, and duplicate detection.
- Developer coding agent integration via Model Context Protocol (MCP).

## Collaboration Workflow

Pinforth is being developed collaboratively using GitHub.

Our workflow follows a feature-branch approach:

1. Create a branch from the latest `main`.
2. Implement a focused feature or improvement.
3. Validate locally (`lint`, `typecheck`, `test`, `build`).
4. Commit and push changes.
5. Open a Pull Request referencing the relevant issue.
6. Verify automated GitHub Actions CI passes.
7. Merge after successful review and verification.

Branch naming examples:

- `feat/review-rounds`
- `feat/feedback-widget`
- `fix/issue-validation`
- `chore/github-actions-ci`

Direct development commits to `main` are discouraged.

## Security

Do not commit environment secrets, credentials, API keys, or sensitive client data.

Use environment example files for documenting required configuration. Secret tokens (such as guest invitation tokens, handoff codes, and widget session tokens) are stored exclusively as SHA-256 hashes and transferred over URL fragments or Authorization headers to prevent logging.

## Project Goal

Pinforth is a collaborative full-stack engineering project intended to explore real-world SaaS architecture, modern frontend development, API design, secure collaboration, visual website tooling, and useful AI integrations.

Our objective is to build a practical and reliable product with a strong focus on usability and engineering quality.

---

**Pinforth — From feedback to sign-off.**
