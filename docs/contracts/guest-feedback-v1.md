# Pinforth API Contract: Guest Review & Widget Feedback (v1)

**Status:** APPROVED FOR IMPLEMENTATION  
**Version:** 1.0.0  
**Target Milestone:** Milestone 2A (Backend) & Frontend/Widget Integration  
**Base Path:** `/api/v1`

---

## 1. Architectural Overview & Security Model

Pinforth Milestone 2A enables invited guest reviewers (e.g., client stakeholders, external QA testers) to inspect staging websites and submit contextual feedback directly into the project's Issues workflow without requiring an agency account or workspace membership.

### The Feedback Flow

```
+-----------------------------------------------------------------------------------------+
|                                    1. Agency Setup                                      |
|  Agency OWNER/ADMIN creates a Review Round linked to a staging Environment, then        |
|  generates a Guest Access Link.                                                         |
|  Endpoint: POST /api/v1/organizations/:orgId/projects/:projectSlug/review-rounds        |
|  Endpoint: POST .../review-rounds/:roundId/guest-links                                  |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                                  2. Review Invitation                                   |
|  Guest receives link: https://app.pinforth.com/review#token=<guestToken>                |
|  Pinforth Web App reads fragment, scrubs address bar, and calls Guest Exchange API.     |
|  Endpoint: POST /api/v1/guest/reviews/exchange                                          |
|  Returns: one-time handoff code & staging URL (#pf_handoff=<handoffCode>)               |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                              3. Staging Site Handoff                                    |
|  Browser redirects to: https://staging.example.com/#pf_handoff=<handoffCode>            |
|  Widget extracts `pf_handoff`, clears the URL fragment via history.replaceState, and    |
|  exchanges it for a short-lived Bearer session token.                                   |
|  Endpoint: POST /api/v1/widget/sessions/exchange                                        |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                            4. Contextual Feedback Submission                            |
|  Reviewer selects element and writes feedback. Widget submits issue with Bearer token.   |
|  Endpoint: POST /api/v1/widget/issues                                                   |
|  Creates Issue with source=WIDGET, status=NEW, structured context, & guest attribution. |
+-----------------------------------------------------------------------------------------+
```

### Security & Token Model

| Secret / Token | Form | Storage / Transport | TTL | Lifecycle & Revocation |
| --- | --- | --- | --- | --- |
| **Guest Invitation Secret** | `pf_gr_<32-byte-base64url>` | Transferred via URL hash fragment `#token=...` to `/review`. Database stores only **SHA-256** hash (`tokenHash`). | 1–90 days (default: 7 days) | Revoked via `DELETE .../guest-links/:linkId` or when review round closes. |
| **Handoff Code** | `pf_hc_<32-byte-base64url>` | Transferred via URL hash fragment `#pf_handoff=...`. Database stores **SHA-256** hash. | 10 minutes | **Single-use**: consumed immediately upon first exchange. Replay attacks rejected. |
| **Widget Session Token** | `pf_ws_<32-byte-base64url>` | Stored in widget memory / `sessionStorage`. Sent via `Authorization: Bearer <token>`. Database stores **SHA-256** hash. | 4 hours | Revoked if parent guest link or session is revoked, or review round closes. |

### Why This Design?

1. **No Third-Party Cookies:** Third-party cookies are blocked by default in modern browsers (Safari ITP, Chrome Privacy Sandbox, Firefox ETP). Pinforth uses explicit bearer tokens.
2. **No Leaked Secrets:** The long-lived guest invitation secret is never sent to the client staging server. It is exchanged through Pinforth's web portal for a single-use handoff code.
3. **URL Fragment Privacy & Transport Protection:** Both the invitation link (`/review#token=...`) and the staging handoff code (`#pf_handoff=...`) are conveyed via URL hash fragments. Per RFC 3986, fragments are never transmitted to web servers, reverse proxies, or CDNs in HTTP requests and do not appear in access logs.
4. **Immediate Client Token Scrubbing:** The `/review` frontend must parse `#token=...` from `window.location.hash` and immediately execute `history.replaceState(null, "", window.location.pathname)` to remove the secret from browser history and the URL bar before triggering any outbound network or asset requests.
5. **Caching & Referrer Controls:** The `/review` page must be served with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (or `strict-origin-when-cross-origin`).
6. **No Raw Secret Logging:** Raw tokens (`pf_gr_...`, `pf_hc_...`, `pf_ws_...`) must never be logged in application or server logs. Only SHA-256 hashes are persisted.
7. **SPA Hash-Routing Limitation:** If the staging site uses hash-based client-side routing (e.g., `/#/checkout`), conveying the handoff code via `#pf_handoff=...` will overwrite the hash fragment on initial load. Sites with hash routing must either handle the handoff code before mounting their router or note that hash routes will reset to the root staging path upon initial handoff.

---

## 2. Global Conventions

### Response Envelope

All API responses follow the standard Pinforth envelope:

**Success (2xx):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Failure (4xx, 5xx):**
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable explanation",
  "details": [ ... ]
}
```

### Common HTTP Error Codes

- `400 BAD_REQUEST` / `VALIDATION_ERROR`: Missing or malformed parameters.
- `401 UNAUTHORIZED`: Missing, expired, or invalid credentials/tokens.
- `403 FORBIDDEN`: Insufficient role permissions, mismatched origin, or closed review round.
- `404 NOT_FOUND`: Resource does not exist (or cross-tenant access prevented).
- `409 CONFLICT`: Duplicate submission or resource collision.
- `413 PAYLOAD_TOO_LARGE`: Request body exceeds payload size limit (max 64 KB for widget).
- `429 TOO_MANY_REQUESTS`: Rate limit exceeded.

---

## 3. Agency Review Rounds API

Authenticated endpoints for organization team members. Mounted under:  
`/api/v1/organizations/:orgId/projects/:projectSlug/review-rounds`

### 3.1 Create a Review Round

Creates a bounded review cycle targeting a specific project environment.

- **Method / Path:** `POST /api/v1/organizations/:orgId/projects/:projectSlug/review-rounds`
- **Auth:** Required (`OWNER` or `ADMIN` role). Verified email required.
- **CORS:** Restricted to `WEB_ORIGIN`.

#### Request Headers
```http
Content-Type: application/json
Origin: http://localhost:3000
Cookie: pf_access=<jwt>
```

#### Request Body
```json
{
  "name": "Sprint 14 Client QA",
  "environmentId": "4c424a52-c380-4cf8-a968-380d3211516e",
  "description": "Please review new checkout layout and responsive navigation."
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | 1 to 180 characters. Trimmed. |
| `environmentId` | UUID string | Yes | Must match an existing environment in the project. |
| `description` | string | No | Max 5,000 characters. Optional markdown/text instructions. |

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "reviewRound": {
      "id": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
      "projectId": "7c126d41-e945-4290-8451-b8417934c9f1",
      "environmentId": "4c424a52-c380-4cf8-a968-380d3211516e",
      "name": "Sprint 14 Client QA",
      "description": "Please review new checkout layout and responsive navigation.",
      "status": "ACTIVE",
      "environment": {
        "id": "4c424a52-c380-4cf8-a968-380d3211516e",
        "name": "Staging",
        "slug": "staging",
        "url": "https://staging.example.com"
      },
      "activeLinksCount": 0,
      "issuesCount": 0,
      "createdAt": "2026-11-05T14:30:00.000Z",
      "updatedAt": "2026-11-05T14:30:00.000Z"
    }
  }
}
```

---

### 3.2 List Review Rounds

Lists all review rounds for a project with summary counts.

- **Method / Path:** `GET /api/v1/organizations/:orgId/projects/:projectSlug/review-rounds`
- **Auth:** Required (Any member: `OWNER`, `ADMIN`, `MEMBER`).
- **Query Params:**
  - `status` (optional): `ACTIVE`, `CLOSED`, or `ARCHIVED`.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "reviewRounds": [
      {
        "id": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
        "projectId": "7c126d41-e945-4290-8451-b8417934c9f1",
        "environmentId": "4c424a52-c380-4cf8-a968-380d3211516e",
        "name": "Sprint 14 Client QA",
        "description": "Please review new checkout layout and responsive navigation.",
        "status": "ACTIVE",
        "environment": {
          "id": "4c424a52-c380-4cf8-a968-380d3211516e",
          "name": "Staging",
          "slug": "staging",
          "url": "https://staging.example.com"
        },
        "activeLinksCount": 2,
        "issuesCount": 4,
        "createdAt": "2026-11-05T14:30:00.000Z",
        "updatedAt": "2026-11-05T14:30:00.000Z"
      }
    ]
  }
}
```

---

### 3.3 Create a Guest Access Link

Generates an invitation secret for a guest reviewer to participate in a review round.

- **Method / Path:** `POST /api/v1/organizations/:orgId/projects/:projectSlug/review-rounds/:roundId/guest-links`
- **Auth:** Required (`OWNER` or `ADMIN`).

#### Request Body
```json
{
  "reviewerName": "Alice Client",
  "reviewerEmail": "alice@clientbrand.com",
  "expiresInDays": 7
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `reviewerName` | string | No | Optional display name for issue attribution (1–160 chars). |
| `reviewerEmail` | string | No | Optional email for reviewer contact/attribution (valid email, max 320 chars). |
| `expiresInDays` | integer | No | Validity duration in days (1 to 90, default: 7). |

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "guestLink": {
      "id": "a9082006-bb21-4f11-9a70-3847c203b8e2",
      "reviewRoundId": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
      "reviewerName": "Alice Client",
      "reviewerEmail": "alice@clientbrand.com",
      "expiresAt": "2026-11-12T14:30:00.000Z",
      "revokedAt": null,
      "createdAt": "2026-11-05T14:30:00.000Z"
    },
    "token": "pf_gr_01j7bc9w4k8z12y3x4w5v6u7t8",
    "invitationUrl": "http://localhost:3000/review#token=pf_gr_01j7bc9w4k8z12y3x4w5v6u7t8"
  }
}
```
*Note:* `token` is returned only once at creation time. The API never stores the raw token, only its SHA-256 hash. The invitation URL uses the fragment `#token=...` to ensure secrets are never sent to web servers or recorded in access logs.

---

### 3.4 Revoke a Guest Access Link

Immediately invalidates a guest link and terminates any active sessions established under it.

- **Method / Path:** `DELETE /api/v1/organizations/:orgId/projects/:projectSlug/review-rounds/:roundId/guest-links/:linkId`
- **Auth:** Required (`OWNER` or `ADMIN`).

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "revoked": true,
    "id": "a9082006-bb21-4f11-9a70-3847c203b8e2"
  }
}
```

---

### 3.5 List Guest Access Links for an Environment

Lists every guest access link across all review rounds belonging to a project environment. This lets organization members see who currently has review access to a website, and lets `OWNER` / `ADMIN` members revoke a link through the existing Delete endpoint using `reviewRoundId`.

- **Method / Path:** `GET /api/v1/organizations/:orgId/projects/:projectSlug/environments/:environmentId/guest-links`
- **Auth:** Required (Any member: `OWNER`, `ADMIN`, `MEMBER`).
- **Tenant scoping:** The organization, project and environment must all belong to the caller's tenant hierarchy. A missing resource, a project from another organization, or an environment from another project all return the same `404 NOT_FOUND` response, so resource existence is never disclosed across tenants.
- **Ordering:** Newest links first by `createdAt` (descending).
- **Pagination:** None. All matching links are returned so the reviewer list is never incomplete.
- **Empty environment:** Returns `200 OK` with `guestLinks: []`.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "guestLinks": [
      {
        "id": "a9082006-bb21-4f11-9a70-3847c203b8e2",
        "reviewRoundId": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
        "reviewerName": "Alice",
        "reviewerEmail": null,
        "status": "ACTIVE",
        "expiresAt": "2026-11-19T14:30:00.000Z",
        "revokedAt": null,
        "createdAt": "2026-11-12T14:30:00.000Z",
        "lastOpenedAt": "2026-11-14T12:30:00.000Z",
        "issuesCount": 3
      }
    ]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID string | Guest access link ID. |
| `reviewRoundId` | UUID string | Review round that owns the link. Required by the Delete endpoint. |
| `reviewerName` | string \| null | Optional reviewer display name. |
| `reviewerEmail` | string \| null | Optional reviewer email. |
| `status` | string | Server-derived status: `REVOKED`, `EXPIRED`, or `ACTIVE` (see below). |
| `expiresAt` | ISO datetime | Link expiration time. |
| `revokedAt` | ISO datetime \| null | Revocation time, if revoked. |
| `createdAt` | ISO datetime | Link creation time. |
| `lastOpenedAt` | ISO datetime \| null | Latest `GuestSession.createdAt` for the link, or `null` if no guest session has been established. Never uses `updatedAt`. |
| `issuesCount` | integer | Number of issues submitted through this guest link. |

Status is derived at request time using a single server clock value, with revocation taking precedence over expiration:

1. `revokedAt` is not null → `REVOKED`.
2. Otherwise, `expiresAt <= now` → `EXPIRED`.
3. Otherwise → `ACTIVE`.

The response never includes secrets: no `tokenHash`, no session token hashes, no handoff `codeHash`, and no raw invitation or session tokens. Guest session and handoff records are never serialized.

---

## 4. Guest Review Access API

Public endpoint used by the Pinforth frontend when the guest lands on the invitation URL.

### 4.1 Exchange Invitation Secret for Staging Handoff

- **Method / Path:** `POST /api/v1/guest/reviews/exchange`
- **Auth:** None (invitation secret provides capability authorization).
- **CORS:** Restricted to `WEB_ORIGIN`.

#### Request Body
```json
{
  "token": "pf_gr_01j7bc9w4k8z12y3x4w5v6u7t8"
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "handoffCode": "pf_hc_b792e4a821944da18579d47913217ac5",
    "targetUrl": "https://staging.example.com",
    "stagingUrl": "https://staging.example.com/#pf_handoff=pf_hc_b792e4a821944da18579d47913217ac5",
    "expiresAt": "2026-11-05T14:40:00.000Z",
    "reviewRound": {
      "id": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
      "name": "Sprint 14 Client QA"
    },
    "reviewer": {
      "name": "Alice Client",
      "email": "alice@clientbrand.com"
    }
  }
}
```

#### Error Behaviors
- If token is missing/malformed: `400 VALIDATION_ERROR`
- If token is expired: `401 UNAUTHORIZED` ("Review invitation has expired")
- If token was revoked: `401 UNAUTHORIZED` ("Review invitation has been revoked")
- If review round is closed or archived: `403 FORBIDDEN` ("Review round is not active")

---

## 5. Staging Feedback Widget API

Endpoints called directly by the Pinforth Feedback SDK embedded inside the staging website.

### 5.1 Exchange Handoff Code for Widget Bearer Session

Exchanges the one-time handoff code for an authorized widget session token.

- **Method / Path:** `POST /api/v1/widget/sessions/exchange`
- **Auth:** Handoff code capability.
- **CORS & Origin:** Restricted to the configured staging `Environment.url` origin.

#### Request Headers
```http
Content-Type: application/json
Origin: https://staging.example.com
```

#### Request Body
```json
{
  "handoffCode": "pf_hc_b792e4a821944da18579d47913217ac5"
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "sessionToken": "pf_ws_7e930182417df8a95628103759247190",
    "expiresAt": "2026-11-05T18:30:00.000Z",
    "project": {
      "id": "7c126d41-e945-4290-8451-b8417934c9f1",
      "name": "Client Brand Website",
      "slug": "client-brand-website"
    },
    "environment": {
      "id": "4c424a52-c380-4cf8-a968-380d3211516e",
      "name": "Staging",
      "slug": "staging",
      "url": "https://staging.example.com"
    },
    "reviewRound": {
      "id": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
      "name": "Sprint 14 Client QA"
    },
    "reviewer": {
      "name": "Alice Client",
      "email": "alice@clientbrand.com"
    }
  }
}
```

#### Replay Protection & Guarantees
- The handoff code is atomically flagged as `usedAt: now()` during exchange. Any subsequent request with the same handoff code returns `401 UNAUTHORIZED` ("Invalid or already used handoff code").
- If the calling browser origin does not match the environment origin: `403 FORBIDDEN` ("Origin not allowed for this environment").

---

### 5.2 Submit Issue from Widget

Creates a new issue in the project issues tracker with structured visual context and guest attribution.

- **Method / Path:** `POST /api/v1/widget/issues`
- **Auth:** `Authorization: Bearer <sessionToken>`
- **CORS & Origin:** Restricted to the configured staging `Environment.url` origin.
- **Payload Limit:** Maximum 64 KB.

#### Request Headers
```http
Content-Type: application/json
Authorization: Bearer pf_ws_7e930182417df8a95628103759247190
Origin: https://staging.example.com
```

#### Request Body
```json
{
  "title": "Checkout button overlaps floating cart on mobile",
  "description": "On viewport width < 400px, the sticky checkout bar covers the order summary totals.",
  "type": "BUG",
  "priority": "HIGH",
  "pageUrl": "https://staging.example.com/checkout",
  "context": {
    "selector": "main > form#checkout-form button[type='submit']",
    "element": {
      "tagName": "BUTTON",
      "id": "submit-btn",
      "classList": ["btn-primary", "sticky-bottom"],
      "textContent": "Place Order",
      "xpath": "/html/body/main/form/button",
      "boundingBox": {
        "top": 720,
        "left": 20,
        "width": 350,
        "height": 48
      }
    },
    "viewport": {
      "width": 390,
      "height": 844,
      "devicePixelRatio": 3
    },
    "scroll": {
      "x": 0,
      "y": 240
    },
    "browser": {
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)...",
      "language": "en-US",
      "platform": "iPhone"
    },
    "timestamp": "2026-11-05T14:35:10.000Z"
  },
  "clientMutationId": "e1f13b65-4f40-424a-b5e0-5a3d76211822"
}
```

#### Field Specifications & Sanitization

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `title` | string | Yes | 1 to 255 characters. Trimmed. |
| `description` | string | No | Max 10,000 characters. Null if empty. |
| `type` | enum | No | `BUG` (default), `DESIGN`, `CONTENT`, `SUGGESTION`. |
| `priority` | enum | No | `LOW`, `MEDIUM` (default), `HIGH`, `CRITICAL`. |
| `pageUrl` | string | Yes | Valid URL. Host/origin must match the staging environment origin. |
| `context` | object | Yes | Structured visual/technical context (detailed below). |
| `clientMutationId` | string | No | UUID or client idempotency identifier. Protects against double-clicks. |

#### Structured Context Schema

The `context` object captures technical inspection details without harvesting private DOM contents:
- `selector` (string, max 1,000 chars): CSS selector path.
- `element` (object, optional):
  - `tagName` (string, max 50 chars, e.g. `"BUTTON"`).
  - `id` (string, max 100 chars, optional).
  - `classList` (array of strings, max 25 items, max 100 chars each).
  - `textContent` (string, max 200 chars, optional): short label snippet.
  - `xpath` (string, max 500 chars, optional).
  - `boundingBox` (object: `top`, `left`, `width`, `height` numbers).
- `viewport` (object): `width` (number), `height` (number), `devicePixelRatio` (number, optional).
- `scroll` (object): `x` (number), `y` (number).
- `browser` (object, optional): Canonical structured technical metadata captured by the widget:
  - `userAgent` (string, max 512 chars, optional).
  - `language` (string, max 35 chars, optional, e.g. `"en-US"`).
  - `platform` (string, max 50 chars, optional, e.g. `"MacIntel"` or `"iPhone"`).
  > [!NOTE]
  > **Frontend Integration Follow-up (for Sachin):** The existing dashboard UI (`apps/web/src/components/issues/issue-context.tsx`) currently assumes `context.browser` is a single string. It will be updated by Sachin in the frontend integration milestone to format the structured `browser` object (e.g. `${platform} · ${language}`).
- `timestamp` (string, optional): ISO datetime string.

> [!CAUTION]
> **Data Privacy Guarantee:** The widget must NEVER collect `value` attributes from `<input>`, `<textarea>`, `<select>`, `<password>`, cookies, session storage, or raw full-page HTML. Internal organization member email addresses are never disclosed in widget API responses.

#### Idempotency & Conflict Policy
A client may provide `clientMutationId` (UUID or client-generated string) to guard against network retries or double-clicks:
- **Database Enforced Uniqueness:** Uniqueness is enforced at the database level across `(guestLinkId, clientMutationId)`. Simultaneous concurrent submissions with the same mutation identifier create exactly one issue; the duplicate attempt is rolled back without consuming an additional sequential issue number.
- **Identical Repeated Requests:** If an issue with that `clientMutationId` already exists for this guest link and the submission data (`title`, `description`, `type`, `priority`, `pageUrl`) matches, the endpoint returns `200 OK` with `isDuplicate: true` and the existing issue.
- **Conflicting Reused Mutation ID:** If the same `clientMutationId` is submitted with different issue data, the API rejects the request with `409 CONFLICT` ("Idempotency conflict: clientMutationId was previously used with different request parameters").

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "issue": {
      "id": "4092b378-dc29-456b-a25e-3991262d16ea",
      "number": 15,
      "title": "Checkout button overlaps floating cart on mobile",
      "description": "On viewport width < 400px, the sticky checkout bar covers the order summary totals.",
      "type": "BUG",
      "priority": "HIGH",
      "status": "NEW",
      "source": "WIDGET",
      "pageUrl": "https://staging.example.com/checkout",
      "environment": {
        "id": "4c424a52-c380-4cf8-a968-380d3211516e",
        "name": "Staging",
        "slug": "staging"
      },
      "reporter": null,
      "guest": {
        "name": "Alice Client",
        "email": "alice@clientbrand.com"
      },
      "reviewRound": {
        "id": "e6745ba6-df11-4770-9831-a8cfd6f83b10",
        "name": "Sprint 14 Client QA"
      },
      "assignee": null,
      "context": { ... },
      "createdAt": "2026-11-05T14:35:15.000Z",
      "updatedAt": "2026-11-05T14:35:15.000Z"
    }
  }
}
```

---

## 6. Compatibility with Existing Dashboard APIs

1. **Sequential Issue Numbers:** The issue number (`#15`) is allocated atomically from the project's atomic counter (`lastIssueNumber`), preserving continuous numbering across both dashboard and widget issues.
2. **Issue List Dashboard (`GET .../issues`):**
   - Widget issues appear with `source: "WIDGET"` and initial `status: "NEW"`.
   - `reporter` is returned as `null` (or guest attribution included in `guest` property).
   - In `apps/web`, `issue.reporter ? personName(issue.reporter) : "Guest reviewer"` handles guest issues natively.
3. **Single Issue View (`GET .../issues/:number`):**
   - Returns the issue detail including `pageUrl`, `context`, `reviewRound`, and `guest`.
