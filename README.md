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
| Database | PostgreSQL 17, Prisma ORM 7 |
| Validation | Zod |
| Package Management | pnpm Workspaces |
| Background Processing (planned) | Redis, BullMQ |
| AI Integration (planned) | LLM APIs |
| Testing | Vitest, Supertest (API); Playwright planned |

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
│       │   ├── config/
│       │   │   └── env.ts     # Validated environment variables
│       │   ├── lib/
│       │   │   ├── errors.ts  # AppError and HTTP error helpers
│       │   │   └── prisma.ts  # Prisma Client instance
│       │   ├── middleware/    # Error handling, origin checks, requireAuth
│       │   ├── modules/
│       │   │   └── auth/      # Routes, service, sessions, tokens, cookies
│       │   └── scripts/
│       │       └── check-db.ts
│       ├── test/              # Test database setup and DB tests
│       ├── prisma.config.ts
│       └── vitest.config.ts
│
├── packages/
│   └── shared/                 # Shared types and Zod schemas
│
├── docker-compose.yml         # Local PostgreSQL and Mailpit
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
| `pnpm test:api` | Run API tests against the test database |

When running individual applications, build the shared package first. Changes to shared package source may require rebuilding it during development.

### Running tests

API tests use Vitest and Supertest against a separate `<database>_test` database (for example `pinforth_test`), so your development data is never touched. With PostgreSQL running:

```bash
pnpm test:api
```

The test database is created and migrated automatically on each run, and tables are emptied between tests. Tests refuse to run against any database whose name does not end in `_test`. Set `TEST_DATABASE_URL` in `.env` to use a different database.

### API environment

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

### Local email

In development, the API sends email to [Mailpit](https://mailpit.axllent.org/), which catches every message instead of delivering it:

```bash
pnpm mail:up      # then open http://localhost:8025
pnpm mail:down
```

Tests don't use SMTP; they capture messages in memory.

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

The reset and verification emails link to `${APP_URL}/reset-password?token=…` and `${APP_URL}/verify-email?token=…`. Both web pages must send `Referrer-Policy: no-referrer`, so the token never leaks through the `Referer` header.

Users can sign in before confirming their email. Routes that need a proven address, such as inviting members or approving releases, add the `requireVerifiedEmail` middleware after `requireAuth`. It returns `403 EMAIL_NOT_VERIFIED`.

When an access token expires, protected routes return `401 ACCESS_TOKEN_EXPIRED`. The client should then call `/refresh` and retry. Non-browser clients may send the access token as `Authorization: Bearer <token>`.

Passwords are hashed with argon2id. Login and signup are rate-limited per IP, and failed logins are also limited per account (5 per 15 minutes).

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
- API foundation: validated environment config, central JSON error handling, security headers, credentialed CORS and origin checks.
- Authentication data model: password hash, email verification, rotating refresh sessions and single-use verification tokens.
- API test setup with an isolated test database.
- Authentication: signup, login, rotating refresh sessions with reuse detection, logout, logout-all, current user, rate limiting.
- Password reset by email, with Mailpit for local email.
- Email verification, and the `requireVerifiedEmail` guard for sensitive actions.

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