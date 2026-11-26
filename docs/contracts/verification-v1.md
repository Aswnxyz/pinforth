# Pinforth API Contract: Fix Submission, QA Verification & Issue Lifecycle (v1)

**Status:** READY FOR FRONTEND REVIEW
**Version:** 1.0.0
**Base Path:** `/api/v1`
**Feature branch:** `feat/issue-verification-api`

---

## 1. Purpose and Scope

Pinforth now enforces the product rules that separate implementation from verification and approval:

- **Reported is not fixed.** Creating or editing an issue never verifies it.
- **Fixed is not verified.** A developer records a fix submission against a real deployment; the issue becomes `READY_FOR_VERIFICATION`, not `VERIFIED`.
- **Verified is not client-approved.** A QA verification records a `PASS` or `FAIL`. Client approval is a later phase.
- **Verification belongs to a deployment.** Every verification records the deployment it was performed against.
- **Failed attempts remain visible.** A failed verification returns the issue to `IN_PROGRESS`, and the failed attempt stays in history.
- **Reopened issues need a new fix.** Reopening clears the current verification state; another verification requires a new fix submission.
- **Solo freelancers can complete the workflow.** A one-member organization may self-verify, permanently recorded as `selfVerified: true`.
- **Multi-member workspaces require independent verification.** A fix submitter cannot verify their own fix, including owners and admins.

In scope: `VERIFIED` status, fix submissions, verifications, attempt history, controlled issue transitions, withdrawal, closing, reopening, environment locking, deletion protection, idempotency, row-level concurrency control, activity timeline events, issue responses, shared types, migrations, and integration tests.

Out of scope: frontend work, new roles, attachments, object storage, release readiness, client approval, CI/CD deployment ingestion, guest verification or guest comments, AI, and MCP integration.

---

## 2. Database Models

### 2.1 `IssueStatus`

```text
NEW
IN_PROGRESS
READY_FOR_VERIFICATION
CLOSED
VERIFIED        -- new
```

`REOPENED` is intentionally **not** a status. Reopening returns an issue to `IN_PROGRESS` and is represented in activity history.

### 2.2 `IssueCloseReason`

```text
RESOLVED
WONT_FIX
DUPLICATE
NOT_A_BUG
OTHER
```

`RESOLVED` is assigned automatically only when closing a `VERIFIED` issue.

### 2.3 `VerificationResult`

```text
PASS
FAIL
```

### 2.4 `Issue` additions

| Column | Type | Notes |
| --- | --- | --- |
| `closeReason` | `IssueCloseReason`, nullable | Set when the issue is closed. Cleared on reopen. |
| `closeNote` | `text`, nullable | Optional for most reasons; required for `OTHER`. Max 5,000 characters. |
| `closedAt` | `timestamptz(3)`, nullable | Set when closed. Cleared on reopen. |
| `closedById` | `uuid`, nullable | Closing actor. `ON DELETE SET NULL`. Cleared on reopen. |

### 2.5 `FixSubmission`

An immutable record of a developer's claim that a specific deployment contains a fix for an issue. A fix is never edited or deleted through the API.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `issueId` | `uuid` | Required. `ON DELETE RESTRICT`. |
| `deploymentId` | `uuid` | Required. `ON DELETE RESTRICT`. |
| `submittedById` | `uuid`, nullable | Authenticated submitter. `ON DELETE SET NULL` so history survives account removal. |
| `note` | `text`, nullable | Trimmed; blank stored as `null`; max 5,000 characters. |
| `clientMutationId` | `varchar(128)` | Required idempotency identifier, trimmed. |
| `attemptNumber` | `integer` | Stable per-issue sequential number starting at `1`. |
| `withdrawnAt` | `timestamptz(3)`, nullable | Set when the submitter withdraws a pending fix. |
| `withdrawnById` | `uuid`, nullable | The submitter who withdrew. `ON DELETE SET NULL`. |
| `createdAt` | `timestamptz(3)` | Immutable creation timestamp. |

Constraints and indexes:

- `UNIQUE (issueId, attemptNumber)`.
- `UNIQUE (issueId, submittedById, clientMutationId)` — actor-scoped idempotency. Because `submittedById` is nullable, PostgreSQL allows multiple historical rows with a `NULL` submitter, but new idempotent requests always have an authenticated, non-null actor.
- `INDEX (issueId, createdAt)`.
- `INDEX (deploymentId)`.
- `INDEX (submittedById)`.

A fix submission becomes **non-verifiable** when it is withdrawn, has a verification, is no longer the latest pending fix, or its issue is not `READY_FOR_VERIFICATION`. Closing or reopening an issue makes its pending fix non-actionable through the issue status while preserving the row.

### 2.6 `Verification`

An immutable QA decision about one fix submission.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `issueId` | `uuid` | Required. `ON DELETE RESTRICT`. |
| `fixSubmissionId` | `uuid` | Required, **unique**. At most one verification per fix. `ON DELETE RESTRICT`. |
| `deploymentId` | `uuid` | The deployment actually selected for retesting. `ON DELETE RESTRICT`. |
| `verifiedById` | `uuid`, nullable | Authenticated verifier. `ON DELETE SET NULL`. |
| `result` | `VerificationResult` | `PASS` or `FAIL`. |
| `note` | `text`, nullable | Trimmed; max 5,000 characters. Required for `FAIL`. |
| `selfVerified` | `boolean` | `true` only when a solo organization member verifies their own fix. Permanent. |
| `clientMutationId` | `varchar(128)` | Required idempotency identifier, trimmed. |
| `createdAt` | `timestamptz(3)` | Immutable creation timestamp. |

Constraints and indexes:

- `UNIQUE (fixSubmissionId)`.
- `UNIQUE (issueId, verifiedById, clientMutationId)` — actor-scoped idempotency.
- `INDEX (issueId, createdAt)`.
- `INDEX (deploymentId)`.
- `INDEX (verifiedById)`.

### 2.7 Referential actions

| Relation | Action | Reason |
| --- | --- | --- |
| `FixSubmission.issueId` | `RESTRICT` | App-level deletion protection; database backstop. |
| `Verification.issueId` | `RESTRICT` | Preserve verification history. |
| `FixSubmission.deploymentId` | `RESTRICT` | Deployments are immutable and must remain resolvable. |
| `Verification.deploymentId` | `RESTRICT` | Same. |
| `FixSubmission.submittedById` | `SET NULL` | Preserve the fix after user removal. |
| `FixSubmission.withdrawnById` | `SET NULL` | Preserve withdrawal attribution where possible. |
| `Verification.verifiedById` | `SET NULL` | Preserve verification after user removal. |
| `Issue.closedById` | `SET NULL` | Preserve closure metadata after user removal. |

Deleting a user never destroys fix or verification history. The API never exposes update or delete endpoints for fix submissions or verifications.

---

## 3. Authorization

All endpoints use the existing hierarchy:

```text
/api/v1/organizations/:orgId/projects/:projectSlug/issues
```

Every route requires authentication, organization membership, a resolved project, and an issue scoped by `projectId + number`.

| Action | Who | Additional rule |
| --- | --- | --- |
| Submit a fix | Any member (`OWNER`, `ADMIN`, `MEMBER`) | Verified email. Actor derived from session. |
| Record a verification | Any member (`OWNER`, `ADMIN`, `MEMBER`) | Verified email. Actor derived from session. |
| Read attempt history | Any member | — |
| Withdraw a pending fix | The submitter of that fix only | Via `PATCH /:number` to `IN_PROGRESS`. |
| Close / reopen an issue | Any member | Existing PATCH authorization. |

- A non-member receives `404 NOT_FOUND`, the same as a missing organization.
- A deployment, fix, or issue from another tenant is indistinguishable from a missing one and returns `404 NOT_FOUND`.
- Actor fields are never accepted from the request body: `submittedById`, `verifiedById`, `closedById`, `selfVerified`, `createdAt`, `closedAt`, `attemptNumber`, `attempt`, and any other server-owned field are rejected by strict validation.
- Owners and admins cannot bypass the independent-verification rule.

---

## 4. Endpoints

### 4.1 Submit a fix

```http
POST /api/v1/organizations/:orgId/projects/:projectSlug/issues/:number/fixes
```

Request:

```json
{
  "deploymentId": "8d7b7f6b-4f0c-4c1b-9d6f-9a0f2a6c1e11",
  "note": "Fixed checkout validation and retested locally.",
  "clientMutationId": "2f0c2f7a-1c2f-4f6d-9f2c-1c2f7a8b9c01"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `deploymentId` | Yes | UUID of an existing deployment in the issue's project. |
| `note` | No | Trimmed. Max 5,000 characters. Blank or `null` becomes `null`. |
| `clientMutationId` | Yes | Trimmed, 1–128 characters, case-sensitive, opaque. A UUID is recommended. |

Success `201 Created`:

```json
{
  "success": true,
  "data": {
    "fix": {
      "id": "b4a5a0a1-6f13-4f4e-9a88-6f1a6f8b7c01",
      "issueId": "0f2b8c1d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
      "attemptNumber": 1,
      "deployment": {
        "id": "8d7b7f6b-4f0c-4c1b-9d6f-9a0f2a6c1e11",
        "label": "v1.5",
        "environmentId": "4c424a52-c380-4cf8-a968-380d3211516e",
        "createdAt": "2026-11-26T10:15:30.000Z"
      },
      "submittedBy": { "id": "b1f6d6d0-7a1c-4f6d-9f2c-1c2f7a8b9c01", "name": "Sachin" },
      "note": "Fixed checkout validation and retested locally.",
      "clientMutationId": "2f0c2f7a-1c2f-4f6d-9f2c-1c2f7a8b9c01",
      "createdAt": "2026-11-26T10:20:00.000Z",
      "withdrawnAt": null,
      "withdrawnBy": null
    },
    "issue": { "...IssueDetail..." }
  }
}
```

- The issue status becomes `READY_FOR_VERIFICATION`.
- If the issue had no environment, its environment is assigned to the selected deployment's environment atomically. Subsequent attempts must use the same environment.
- `FIX_SUBMITTED` activity is written in the same transaction.
- `issue` in the response is the current issue detail after the mutation, including `attemptCount`, `pendingFix` and `verifiedOn`.

### 4.2 Record a verification

```http
POST /api/v1/organizations/:orgId/projects/:projectSlug/issues/:number/verifications
```

Request:

```json
{
  "fixSubmissionId": "b4a5a0a1-6f13-4f4e-9a88-6f1a6f8b7c01",
  "result": "PASS",
  "note": "Retested checkout on desktop and mobile.",
  "deploymentId": "8d7b7f6b-4f0c-4c1b-9d6f-9a0f2a6c1e11",
  "clientMutationId": "9d6f9a0f-2a6c-4c1b-8d7b-7f6b4f0c4c1b"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `fixSubmissionId` | Yes | UUID of the fix being verified on this issue. |
| `result` | Yes | `PASS` or `FAIL`. |
| `note` | No | Trimmed. Max 5,000 characters. **Required, non-empty, for `FAIL`.** |
| `deploymentId` | No | Optional UUID. Defaults to the fix's deployment. Must be the same environment and the same or a newer deployment. |
| `clientMutationId` | Yes | Same format as fix submissions. |

Success `201 Created`:

```json
{
  "success": true,
  "data": {
    "verification": {
      "id": "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f",
      "issueId": "0f2b8c1d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
      "fixSubmissionId": "b4a5a0a1-6f13-4f4e-9a88-6f1a6f8b7c01",
      "deployment": {
        "id": "8d7b7f6b-4f0c-4c1b-9d6f-9a0f2a6c1e11",
        "label": "v1.5",
        "environmentId": "4c424a52-c380-4cf8-a968-380d3211516e",
        "createdAt": "2026-11-26T10:15:30.000Z"
      },
      "verifiedBy": { "id": "c2e7e7e1-8b2d-4a5e-8a3d-2d3a8b9c0d02", "name": "Priya" },
      "result": "PASS",
      "note": "Retested checkout on desktop and mobile.",
      "selfVerified": false,
      "createdAt": "2026-11-26T11:00:00.000Z"
    },
    "issue": { "...IssueDetail..." }
  }
}
```

- `PASS`: issue status becomes `VERIFIED`; `VERIFICATION_PASSED` activity.
- `FAIL`: issue status becomes `IN_PROGRESS`; `VERIFICATION_FAILED` activity. The failed attempt remains in history. A new fix submission is required before another verification.
- A successful verification, its issue state update, and its activity write commit together.

### 4.3 Attempt history

```http
GET /api/v1/organizations/:orgId/projects/:projectSlug/issues/:number/attempts
```

Response `200 OK`:

```json
{
  "success": true,
  "data": {
    "attempts": [
      {
        "attempt": 2,
        "fix": {
          "id": "d1e2f3a4-5b6c-4d7e-8f90-1a2b3c4d5e6f",
          "issueId": "0f2b8c1d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
          "attemptNumber": 2,
          "deployment": { "id": "9f0a...", "label": "v1.6", "environmentId": "4c42...", "createdAt": "2026-11-27T09:00:00.000Z" },
          "submittedBy": { "id": "b1f6...", "name": "Sachin" },
          "note": "Second attempt after failed verification.",
          "clientMutationId": "fix-2",
          "createdAt": "2026-11-27T09:10:00.000Z",
          "withdrawnAt": null,
          "withdrawnBy": null
        },
        "verification": null
      },
      {
        "attempt": 1,
        "fix": { "...FixSubmission..." },
        "verification": {
          "id": "c7d8...",
          "issueId": "0f2b...",
          "fixSubmissionId": "b4a5...",
          "deployment": { "id": "8d7b...", "label": "v1.5", "environmentId": "4c42...", "createdAt": "2026-11-26T10:15:30.000Z" },
          "verifiedBy": { "id": "c2e7...", "name": "Priya" },
          "result": "FAIL",
          "note": "Checkout still fails on mobile Safari.",
          "selfVerified": false,
          "createdAt": "2026-11-26T11:00:00.000Z"
        }
      }
    ]
  }
}
```

- Attempts are ordered newest first by the stored `attemptNumber`.
- `attempt` is stable and never renumbered, even when timestamps collide or a fix is withdrawn.
- `verification` is `null` for untested or withdrawn fixes.
- Withdrawn fixes remain in the list with `withdrawnAt` and `withdrawnBy` set.
- Only `id` and `name` are exposed for people. Emails are not included.
- The service resolves the issue, then loads its fixes and related records with a single Prisma relation read. It does not query per attempt.

---

## 5. Issue Lifecycle

### 5.1 Transition matrix

| Current status | Target | How | Allowed | Activity |
| --- | --- | --- | --- | --- |
| `NEW` | `IN_PROGRESS` | PATCH | Yes | `STATUS_CHANGED` |
| `NEW` | `CLOSED` | PATCH + unverified close reason | Yes | `ISSUE_CLOSED` |
| `NEW` | `READY_FOR_VERIFICATION` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `NEW` | `READY_FOR_VERIFICATION` | Fix submission | Yes | `FIX_SUBMITTED` |
| `NEW` | `VERIFIED` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `IN_PROGRESS` | `NEW` | PATCH | Yes | `STATUS_CHANGED` |
| `IN_PROGRESS` | `CLOSED` | PATCH + unverified close reason | Yes | `ISSUE_CLOSED` |
| `IN_PROGRESS` | `READY_FOR_VERIFICATION` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `IN_PROGRESS` | `READY_FOR_VERIFICATION` | Fix submission | Yes | `FIX_SUBMITTED` |
| `IN_PROGRESS` | `VERIFIED` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `READY_FOR_VERIFICATION` | `IN_PROGRESS` | PATCH by the fix submitter | Yes, withdraws the pending fix | `FIX_WITHDRAWN` |
| `READY_FOR_VERIFICATION` | `IN_PROGRESS` | Verification `FAIL` | Yes | `VERIFICATION_FAILED` |
| `READY_FOR_VERIFICATION` | `VERIFIED` | Verification `PASS` | Yes | `VERIFICATION_PASSED` |
| `READY_FOR_VERIFICATION` | `CLOSED` | PATCH + unverified close reason | Yes, pending fix becomes non-actionable | `ISSUE_CLOSED` |
| `READY_FOR_VERIFICATION` | `NEW` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `VERIFIED` | `CLOSED` | PATCH | Yes, `closeReason` forced to `RESOLVED` | `ISSUE_CLOSED` |
| `VERIFIED` | `IN_PROGRESS` | PATCH | Yes, reopen | `ISSUE_REOPENED` |
| `VERIFIED` | `NEW` / `READY_FOR_VERIFICATION` | PATCH | **No, 409 `INVALID_TRANSITION`** | — |
| `CLOSED` | `IN_PROGRESS` | PATCH | Yes, reopen | `ISSUE_REOPENED` |
| `CLOSED` | any other status | PATCH | **No, 409 `INVALID_TRANSITION`** | — |

A PATCH that leaves all supplied fields unchanged does not write the issue, change `updatedAt`, or create activity. A withdrawal request against a pending issue with no actionable fix returns `409 FIX_NOT_CURRENT`. A PATCH that targets `READY_FOR_VERIFICATION` or `VERIFIED` while the issue is already in that same status is also treated as a no-op; attempts to **change into** those statuses are rejected.

### 5.2 Closing

- Closing from `VERIFIED`:
  - `closeReason` is forced to `RESOLVED` even if omitted.
  - A supplied `closeReason` must be `RESOLVED`.
  - `closeNote` is optional.
- Closing from any other status requires one of `WONT_FIX`, `DUPLICATE`, `NOT_A_BUG`, `OTHER`.
  - `RESOLVED` is rejected with `409 INVALID_TRANSITION`.
  - `OTHER` requires a non-empty `closeNote`; otherwise `400 VALIDATION_ERROR`.
- `closeNote` max 5,000 characters after trimming; blank becomes `null`.
- `closedAt` and `closedById` are derived by the server. Clients cannot send them.
- If the issue has a pending fix, closing is atomic and makes that fix non-actionable. The fix row is preserved and is not presented as `pendingFix`.
- Repeated `status: CLOSED` without changed close fields does not duplicate activity or overwrite closure metadata. Changing stored closure metadata on an already-closed issue is rejected with `409 INVALID_TRANSITION`.

### 5.3 Reopening

Reopening a `VERIFIED` or `CLOSED` issue to `IN_PROGRESS`:

- Clears `closeReason`, `closeNote`, `closedAt` and `closedById`.
- Adds `ISSUE_REOPENED` activity.
- Preserves every fix submission and verification.
- Sets `verifiedOn` to `null`.
- Requires a new fix submission before another verification.

### 5.4 Environment edits

- Before any fix submission exists, the existing PATCH behavior remains: the environment may be changed or cleared.
- Once at least one fix submission exists, `environmentId` is locked:
  - Submitting the same value is allowed.
  - Submitting a different value, or clearing it, returns `409 ENVIRONMENT_LOCKED`.
- This prevents historical fixes and verifications from becoming inconsistent with the issue's environment.
- No environment reassignment workflow is implemented in this phase.

### 5.5 Issue deletion

- Hard deletion remains available only for issues with no fix submissions and no verifications.
- Deleting an issue with any fix or verification returns `409 ISSUE_HAS_VERIFICATION_HISTORY`.
- Database foreign keys use `ON DELETE RESTRICT` as a backstop.
- Comments and activity continue to cascade only for issues that are actually deleted.

---

## 6. Idempotency and Retries

### 6.1 Identifier format

- `clientMutationId` is a trimmed, case-sensitive, opaque string of 1–128 characters.
- A UUID is recommended. It should be generated once per user action and reused only for retries of that action.

### 6.2 Scope and uniqueness

The database uniqueness scope is:

```text
operation table + issueId + authenticated actorId + clientMutationId
```

- Fix submissions: `UNIQUE (issueId, submittedById, clientMutationId)`.
- Verifications: `UNIQUE (issueId, verifiedById, clientMutationId)`.

A different actor may reuse the same identifier without colliding or seeing another actor's record.

### 6.3 Replay behavior

The idempotency check runs inside the transaction. For verification, authorize the organization, project, and issue first, then resolve the fix within that issue. A missing or out-of-scope fix returns `404 NOT_FOUND`. For a scoped fix, return a matching replay or reject a conflicting mutation identifier before checking whether the fix is current. Without a matching replay, a historical, withdrawn, already verified, or otherwise noncurrent fix returns `409 FIX_NOT_CURRENT`.

| Situation | Result |
| --- | --- |
| Same actor, same scope, same identifier, same normalized input | `200 OK` with the existing record and the current issue. No new record or activity. |
| Same actor, same scope, same identifier, different normalized input | `409 IDEMPOTENCY_KEY_REUSED`. |
| Different actor, same identifier | Independent request; no collision and no disclosure. |
| First request | `201 Created`. |

Normalized input comparison:

- **Fix:** `deploymentId`, and `note` after trimming/blank-to-null.
- **Verification:** `fixSubmissionId`, `result`, `note` after trimming/blank-to-null, and the **effective** `deploymentId` (the supplied deployment, or the fix's deployment when omitted).

Replay is recognized even if the issue status has since changed (for example, a fix was subsequently withdrawn). The response contains the current issue state, not a historical snapshot.

Concurrent identical requests are serialized by the issue row lock. Exactly one record and one activity event are created; the other request re-reads and returns `200`.

---

## 7. Concurrency and Transactions

Every lifecycle mutation uses an issue-row lock:

```sql
SELECT id
FROM "Issue"
WHERE "projectId" = $1 AND number = $2
FOR UPDATE
```

The query is parameterized through Prisma tagged templates; untrusted strings are never interpolated.

| Operation | Isolation | Strategy |
| --- | --- | --- |
| Fix submission | Default PostgreSQL isolation | Issue row lock serializes submissions and status changes. |
| Verification | `READ COMMITTED` with up to three attempts on `P2034` | Organization row lock, current actor membership check, then issue row lock. |
| Withdrawal / closing / reopening / PATCH | Default | Issue row lock. |
| Issue deletion | Default | Issue row lock, then history check. |

This makes the following impossible:

- Two current pending fixes.
- Two verifications for one fix (also enforced by `UNIQUE (fixSubmissionId)`).
- Verifying a withdrawn fix.
- Verifying a fix after the issue is closed.
- Bypassing the state machine with concurrent PATCH requests.
- Duplicate activity from retried requests.
- A verification commit without its issue status update, or a status transition without its activity row.

If any step fails, the transaction rolls back completely.

Verification, invitation acceptance, and member removal acquire the same organization row lock before checking or changing membership. Verification rechecks the actor's membership under that lock. Self-verification requires the actor to be the sole current member. These operations are ordered by acquiring the lock, regardless of request arrival time. Creating a new organization and its owner is atomic. Role changes do not change the membership set. Pending invitations are never counted. Future membership writers must participate in this locking protocol.

PATCH uses the issue status observed after acquiring the issue lock. If a PASS wins a race with a PATCH to `IN_PROGRESS`, the PATCH reopens the verified issue and preserves the verification. If withdrawal wins, a new verification of that fix returns `409 FIX_NOT_CURRENT`.

---

## 8. Deployment Rules

### 8.1 Fix submission

- The deployment must exist and belong to the issue's project.
- If the issue has an environment, the deployment must belong to that environment.
- If the issue has no environment, the first fix assigns the deployment's environment to the issue atomically.
- A deployment from another project or tenant returns `404 NOT_FOUND`.
- A deployment in the same project but a different environment returns `409 DEPLOYMENT_ENVIRONMENT_MISMATCH`.

### 8.2 Verification

- `deploymentId` is optional; omitted means the fix's deployment.
- The effective deployment must exist in the issue's project.
- It must be in the same environment as the fix's deployment.
- It must be the same deployment or a **newer recorded deployment**, using the deployment ordering `createdAt DESC, id DESC`.
- An older deployment returns `409 DEPLOYMENT_NOT_NEWER`.
- A deployment from another project or tenant returns `404 NOT_FOUND`.
- A deployment in a different environment returns `409 DEPLOYMENT_ENVIRONMENT_MISMATCH`.

Pinforth does not fetch or probe a deployment URL. A verification records the tester's assertion about the selected deployment; it does not prove what a hosting provider served.

---

## 9. Self-Verification

- If the authenticated verifier is the submitter of the fix:
  - Count the organization's current `OrganizationMember` rows.
  - More than one member: `403 SELF_VERIFICATION_NOT_ALLOWED`.
  - Exactly one member: allowed, with `selfVerified: true`.
- Owners and admins cannot bypass this rule.
- Pending invitations are not members and do not affect the count.
- `selfVerified` is stored permanently and is never recalculated after membership changes.

---

## 10. Issue Responses

### 10.1 `IssueSummary` addition

Every issue summary (list, create, update, detail) adds:

```json
{ "closeReason": "DUPLICATE" }
```

`closeReason` is `null` unless the issue is closed.

### 10.2 `IssueDetail` additions

```json
{
  "attemptCount": 2,
  "pendingFix": {
    "id": "d1e2...",
    "issueId": "0f2b...",
    "attemptNumber": 2,
    "deployment": { "id": "9f0a...", "label": "v1.6", "environmentId": "4c42...", "createdAt": "2026-11-27T09:00:00.000Z" },
    "submittedBy": { "id": "b1f6...", "name": "Sachin" },
    "note": "Second attempt.",
    "createdAt": "2026-11-27T09:10:00.000Z"
  },
  "verifiedOn": {
    "verificationId": "c7d8...",
    "deployment": { "id": "8d7b...", "label": "v1.5" },
    "verifiedBy": { "id": "c2e7...", "name": "Priya" },
    "selfVerified": false,
    "verifiedAt": "2026-11-26T11:00:00.000Z"
  },
  "closeReason": "RESOLVED",
  "closeNote": null,
  "closedAt": "2026-11-27T12:00:00.000Z",
  "closedBy": { "id": "b1f6...", "name": "Sachin" }
}
```

Definitions:

- `attemptCount`: total fix submissions, including withdrawn and failed attempts.
- `pendingFix`: non-null only when the issue is `READY_FOR_VERIFICATION` and its latest fix is neither withdrawn nor verified. It is `null` for every other status, and `null` for a closed or reopened issue.
- `verifiedOn`: non-null only for `VERIFIED`, or for `CLOSED` with `closeReason: "RESOLVED"`. It contains the latest `PASS` verification for the issue. It is `null` for reopened, in-progress, or unverified-closed issues.
- Historical passes remain available through attempt history even after `verifiedOn` becomes `null`.
- `closedBy` contains `id` and `name` only. Emails are not exposed for these new fields.

### 10.3 Status filters and counts

- `VERIFIED` is a valid list filter.
- Status counts include `VERIFIED` alongside `all`, `NEW`, `IN_PROGRESS`, `READY_FOR_VERIFICATION`, and `CLOSED`.
- The existing `READY_FOR_VERIFICATION` filter is the QA queue. No separate QA queue endpoint is introduced.

---

## 11. Activity Timeline

The existing timeline endpoint automatically includes the new activity types.

### 11.1 New activity types

```text
FIX_SUBMITTED
FIX_WITHDRAWN
VERIFICATION_PASSED
VERIFICATION_FAILED
ISSUE_CLOSED
ISSUE_REOPENED
```

### 11.2 Payloads

| `activityType` | `oldValue` | `newValue` | Timeline copy |
| --- | --- | --- | --- |
| `FIX_SUBMITTED` | `null` | `{ fixId, attemptNumber, deploymentId, deploymentLabel }` | "submitted a fix in v1.5" |
| `FIX_WITHDRAWN` | `{ fixId, attemptNumber, deploymentId, deploymentLabel }` | `null` | "withdrew the fix for v1.5" |
| `VERIFICATION_PASSED` | `{ fixId, attemptNumber, deploymentId, deploymentLabel }` | `{ verificationId, fixId, deploymentId, deploymentLabel, result, selfVerified }` | "verified the fix on v1.5" |
| `VERIFICATION_FAILED` | `{ fixId, attemptNumber, deploymentId, deploymentLabel }` | `{ verificationId, fixId, deploymentId, deploymentLabel, result, selfVerified }` | "marked the fix as failed on v1.5" |
| `ISSUE_CLOSED` | previous status string | `{ closeReason, closeNote }` | "closed this issue as Duplicate" |
| `ISSUE_REOPENED` | previous status string | `"IN_PROGRESS"` | "reopened this issue" |

Only the columns documented above are present in each payload. `deploymentLabel` is snapshotted into the activity so history remains readable.

### 11.3 No duplicate status activity

For lifecycle transitions, the specialized activity replaces `STATUS_CHANGED`:

- A fix submission to `READY_FOR_VERIFICATION` writes `FIX_SUBMITTED`, not `STATUS_CHANGED`.
- A withdrawal writes `FIX_WITHDRAWN`, not `STATUS_CHANGED`.
- A verification writes `VERIFICATION_PASSED` or `VERIFICATION_FAILED`, not `STATUS_CHANGED`.
- Closing writes `ISSUE_CLOSED`, not `STATUS_CHANGED`.
- Reopening writes `ISSUE_REOPENED`, not `STATUS_CHANGED`.

Ordinary `NEW ↔ IN_PROGRESS` changes continue to write `STATUS_CHANGED`. Existing comments, activity, cursor pagination, and internal-note privacy are unchanged.

---

## 12. Validation

| Input | Rule | Failure |
| --- | --- | --- |
| Fix `deploymentId` | UUID | `400 VALIDATION_ERROR` |
| Fix `note` | Optional/nullable, trimmed, max 5,000; blank → `null` | `400 VALIDATION_ERROR` |
| Verification `fixSubmissionId` | UUID | `400 VALIDATION_ERROR` |
| Verification `result` | `PASS` or `FAIL` | `400 VALIDATION_ERROR` |
| Verification `note` | Optional/nullable, trimmed, max 5,000; blank → `null`; required for `FAIL` | `400 VALIDATION_ERROR` |
| Verification `deploymentId` | Optional/nullable UUID | `400 VALIDATION_ERROR` |
| `clientMutationId` | Required, trimmed, 1–128 characters | `400 VALIDATION_ERROR` |
| `closeReason` | `IssueCloseReason`; only with `status: "CLOSED"` | `400 VALIDATION_ERROR` |
| `closeNote` | Optional/nullable, trimmed, max 5,000; required for `OTHER` | `400 VALIDATION_ERROR` |
| `status` | Valid `IssueStatus` | `400 VALIDATION_ERROR` |
| Direct `READY_FOR_VERIFICATION` / `VERIFIED` change | — | `409 INVALID_TRANSITION` |
| Unknown fields | Strict schemas | `400 VALIDATION_ERROR` |
| `:number` | Positive integer inside the project | `404 NOT_FOUND` |

Unknown fields include `submittedById`, `verifiedById`, `closedById`, `selfVerified`, `createdAt`, `closedAt`, `attemptNumber`, and `attempt`.

---

## 13. Error Codes

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Zod validation failure, including required failure note, missing close reason, `OTHER` without a note, unknown fields. |
| `400` | `BAD_REQUEST` | Other request-level rejection where documented (for example, an incompatible close field combination). |
| `401` | `UNAUTHORIZED` | No authenticated session. |
| `403` | `EMAIL_NOT_VERIFIED` | Unverified member submits a fix or verification. |
| `403` | `SELF_VERIFICATION_NOT_ALLOWED` | Fix submitter tries to verify their own fix in a multi-member organization. |
| `403` | `FORBIDDEN` | Withdrawal by someone other than the current fix submitter, or an existing role restriction. |
| `404` | `NOT_FOUND` | Issue, deployment, fix, project, or organization missing or outside the caller's tenant. |
| `409` | `INVALID_TRANSITION` | Forbidden status transition, direct `READY_FOR_VERIFICATION`/`VERIFIED`, closing with `RESOLVED` while unverified, changing closure metadata. |
| `409` | `FIX_ALREADY_PENDING` | Fix submitted while the issue is already `READY_FOR_VERIFICATION`. |
| `409` | `FIX_NOT_CURRENT` | Fix is withdrawn, already verified, no longer the latest pending fix, or otherwise not actionable. |
| `409` | `IDEMPOTENCY_KEY_REUSED` | Same actor reused a `clientMutationId` with different normalized input. |
| `409` | `DEPLOYMENT_ENVIRONMENT_MISMATCH` | Deployment belongs to another environment than the issue/fix. |
| `409` | `DEPLOYMENT_NOT_NEWER` | Verification selected a deployment older than the fix deployment. |
| `409` | `ENVIRONMENT_LOCKED` | Attempt to change or clear the environment after a fix exists. |
| `409` | `ISSUE_HAS_VERIFICATION_HISTORY` | Attempt to hard-delete an issue with fix or verification records. |
| `500` | `INTERNAL_ERROR` | Unexpected failure. Internal details are not returned. |

---

## 14. Legacy Data Migration

The original schema and legacy backfill migrations retain their applied checksums. The schema migration adds the history tables, closure fields, indexes, and enum values. PostgreSQL appends `VERIFIED` after `CLOSED`, which matches the Prisma schema.

On databases that have yet to apply the original backfill, a migration installs a temporary trigger before it runs. A subsequent migration removes the trigger. Run the entire batch with issue writers paused until the cleanup migration finishes.

- Legacy `READY_FOR_VERIFICATION` issues without any real fix submission move to `IN_PROGRESS`. Pending issues with fix history retain their status.
- Legacy `CLOSED` issues without a reason receive `OTHER`. An existing note is preserved. If missing, the note becomes "Closed before close reasons were recorded. The original reason is unknown."
- Existing closure reasons, notes on already classified rows, actors, timestamps, fixes, and verifications are preserved.
- The backfill does not change `updatedAt`, emit timeline events, or fabricate historical actors, timestamps, or verification records.
- Databases where the original backfill is already applied skip the temporary guard. The forward migrations cannot reconstruct metadata previously overwritten by that backfill.

---

## 15. Frontend Integration Notes

1. **Status model:** add `VERIFIED` to status constants, labels, tones, filters, badges, and response guards. The current web guards reject `VERIFIED`, so the frontend must be updated before the API feature is exposed.
2. **Status transitions:** remove or disable direct actions that PATCH `READY_FOR_VERIFICATION` or `VERIFIED`. Use fix submission and verification endpoints instead.
3. **Fix submission UI:** require a deployment, generate a `clientMutationId`, send `{ deploymentId, note?, clientMutationId }`, and handle `409 FIX_ALREADY_PENDING`, `409 DEPLOYMENT_ENVIRONMENT_MISMATCH`, and `404 NOT_FOUND`.
4. **Verification UI:** select the fix, result, note, and optional deployment. Generate a new `clientMutationId`. Handle `403 SELF_VERIFICATION_NOT_ALLOWED`, `404 NOT_FOUND`, `409 FIX_NOT_CURRENT`, `409 DEPLOYMENT_NOT_NEWER`, and `409 IDEMPOTENCY_KEY_REUSED`.
5. **Retries:** after an uncertain network result, retry with the **same** `clientMutationId`. A `200` means the earlier request succeeded; do not send a new identifier. A `409 IDEMPOTENCY_KEY_REUSED` means the identifier was used with different input; show a conflict and let the user review.
6. **Attempts:** render `GET /:number/attempts` newest first. A `verification: null` fix is untested or withdrawn; check `withdrawnAt` to distinguish. `attempt` is stable.
7. **Issue detail:** use `pendingFix` to show the currently actionable fix, `verifiedOn` for the current valid PASS, and `attemptCount` for history. Do not infer pending state from history.
8. **Closing:** require a close reason for unverified issues; require a note for `OTHER`; do not send `RESOLVED` for unverified issues. Closing from `VERIFIED` is automatically `RESOLVED`.
9. **Reopening:** reopening clears close metadata and `verifiedOn`; the UI must require a new fix before verification.
10. **Environment:** once `attemptCount > 0`, disable environment changes in the issue editor.
11. **Activity:** extend activity rendering for `FIX_SUBMITTED`, `FIX_WITHDRAWN`, `VERIFICATION_PASSED`, `VERIFICATION_FAILED`, `ISSUE_CLOSED`, and `ISSUE_REOPENED`. The existing web timeline treats unknown activity types generically, but the copy should be specific.
12. **Deletion:** hide or disable hard deletion for issues with `attemptCount > 0`; the API returns `409 ISSUE_HAS_VERIFICATION_HISTORY`.
13. **Types:** import the new schemas and types from `@pinforth/shared`.

Affected frontend files (to be updated by the frontend developer):

- `apps/web/src/lib/issues/api.ts`
- `apps/web/src/lib/issues/labels.ts`
- `apps/web/src/lib/issues/comments-api.ts`
- `apps/web/src/lib/issues/timeline.ts`
- Issue status filters, badges, forms, and detail panels.

Coordinate the backend and frontend rollout. The current web guards reject `VERIFIED`, and the existing editor issues PATCH requests that the new lifecycle rejects. Deploy compatible guards and lifecycle actions before exposing the updated backend to the dashboard. Offer withdrawal via PATCH to `IN_PROGRESS` only to the submitter of the current pending fix.

---

## 16. Shared Types

`@pinforth/shared` exports:

```ts
import {
  issueCloseReasonSchema,
  type IssueCloseReason,
  verificationResultSchema,
  type VerificationResult,
  createFixSubmissionSchema,
  type CreateFixSubmissionInput,
  createVerificationSchema,
  type CreateVerificationInput,
  type FixSubmission,
  type Verification,
  type Attempt,
  type AttemptHistoryResponse,
  type PendingFix,
  type VerifiedOn,
  type CreateFixResponse,
  type CreateVerificationResponse,
} from "@pinforth/shared";
```

The contract remains the source of truth. Shared types mirror it.
