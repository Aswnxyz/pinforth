import { afterEach, describe, expect, it, vi } from "vitest";
import { getIssue } from "@/lib/issues/api";
import { listAttempts, recordVerification, submitFix, type Attempt } from "@/lib/issues/verification-api";
import {
  attemptState,
  canWithdraw,
  isSameOrNewer,
  newMutationId,
  prepareFix,
  prepareTest,
  reopenedAfter,
  retestOptions,
  testAccess,
} from "@/lib/issues/verification-values";

/** Pins docs/contracts/verification-v1.md. */

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const BASE = `/api/v1/organizations/${ORG_ID}/projects/site/issues/12`;
const DEP_ID = "4c424a52-c380-4cf8-a968-380d3211516e";
const FIX_ID = "b4a5a0a1-6f13-4f4e-9a88-6f1a6f8b7c01";

const deployment = (over = {}) => ({
  id: DEP_ID,
  label: "v1.5",
  environmentId: "env-1",
  createdAt: "2026-11-26T10:15:30.000Z",
  ...over,
});
const priya = { id: "u-priya", name: "Priya" };
const sachin = { id: "u-sachin", name: "Sachin" };

const fix = (over = {}) => ({
  id: FIX_ID,
  issueId: "i-1",
  attemptNumber: 1,
  deployment: deployment(),
  submittedBy: sachin,
  note: null,
  clientMutationId: "m-1",
  createdAt: "2026-11-26T10:20:00.000Z",
  withdrawnAt: null,
  withdrawnBy: null,
  ...over,
});

const verification = (over = {}) => ({
  id: "v-1",
  issueId: "i-1",
  fixSubmissionId: FIX_ID,
  deployment: deployment(),
  verifiedBy: priya,
  result: "PASS",
  note: null,
  selfVerified: false,
  createdAt: "2026-11-26T11:00:00.000Z",
  ...over,
});

const issue = (over = {}) => ({
  id: "i-1", number: 12, title: "Checkout fails", type: "BUG", priority: "HIGH",
  status: "READY_FOR_VERIFICATION", source: "DASHBOARD", reporter: null, assignee: null,
  environment: { id: "env-1", name: "Staging" }, commentsCount: 0, closeReason: null,
  createdAt: "2026-11-01T09:00:00.000Z", updatedAt: "2026-11-26T10:20:00.000Z",
  description: null, pageUrl: null, context: null,
  attemptCount: 1,
  pendingFix: { id: FIX_ID, issueId: "i-1", attemptNumber: 1, deployment: deployment(), submittedBy: sachin, note: null, createdAt: "2026-11-26T10:20:00.000Z" },
  verifiedOn: null, closeNote: null, closedAt: null, closedBy: null,
  ...over,
});

function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("issue detail", () => {
  it("reads the pending fix, the passing test and the attempt count", async () => {
    stubFetch({ success: true, data: { issue: issue() } });
    expect((await getIssue(ORG_ID, "site", 12)).status).toBe("success");

    const verified = issue({
      status: "VERIFIED",
      pendingFix: null,
      verifiedOn: { verificationId: "v-1", deployment: { id: DEP_ID, label: "v1.5" }, verifiedBy: priya, selfVerified: false, verifiedAt: "2026-11-26T11:00:00.000Z" },
    });
    stubFetch({ success: true, data: { issue: verified } });
    expect((await getIssue(ORG_ID, "site", 12)).status).toBe("success");
  });

  it("treats a missing count or a malformed fix as unavailable", async () => {
    stubFetch({ success: true, data: { issue: issue({ attemptCount: undefined }) } });
    expect((await getIssue(ORG_ID, "site", 12)).status).toBe("unavailable");
    stubFetch({ success: true, data: { issue: issue({ pendingFix: { id: FIX_ID } }) } });
    expect((await getIssue(ORG_ID, "site", 12)).status).toBe("unavailable");
  });
});

describe("fix and verification client", () => {
  const fixInput = { deploymentId: DEP_ID, note: null, clientMutationId: "m-1" };

  it("submits a fix, and a replay of the same id reads the same", async () => {
    const calls = stubFetch({ success: true, data: { fix: fix(), issue: issue() } }, 201);
    const created = await submitFix(ORG_ID, "site", 12, fixInput);
    expect(created.status).toBe("success");
    expect(calls[0].url).toContain(`${BASE}/fixes`);
    expect(calls[0].init).toMatchObject({ method: "POST", body: JSON.stringify(fixInput) });

    stubFetch({ success: true, data: { fix: fix(), issue: issue() } }, 200);
    expect(await submitFix(ORG_ID, "site", 12, fixInput)).toEqual(created);
  });

  it("keeps the error code, and treats an outage or a bad body as unknown", async () => {
    stubFetch({ success: false, code: "FIX_ALREADY_PENDING", message: "Pending" }, 409);
    expect(await submitFix(ORG_ID, "site", 12, fixInput)).toEqual({ status: "conflict", message: "Pending", code: "FIX_ALREADY_PENDING" });

    stubFetch({ success: false, code: "INTERNAL_ERROR", message: "Oops" }, 500);
    expect((await submitFix(ORG_ID, "site", 12, fixInput)).status).toBe("unavailable");

    stubFetch({ success: true, data: { fix: fix() } }, 201);
    expect((await submitFix(ORG_ID, "site", 12, fixInput)).status).toBe("unavailable");
  });

  it("records a result and names who may not verify", async () => {
    const input = { fixSubmissionId: FIX_ID, result: "PASS" as const, clientMutationId: "m-2" };
    const calls = stubFetch({ success: true, data: { verification: verification(), issue: issue({ status: "VERIFIED", pendingFix: null }) } }, 201);
    expect((await recordVerification(ORG_ID, "site", 12, input)).status).toBe("success");
    expect(calls[0].url).toContain(`${BASE}/verifications`);

    stubFetch({ success: false, code: "SELF_VERIFICATION_NOT_ALLOWED", message: "Someone else" }, 403);
    expect(await recordVerification(ORG_ID, "site", 12, input)).toEqual({
      status: "forbidden", message: "Someone else", code: "SELF_VERIFICATION_NOT_ALLOWED",
    });

    stubFetch({ success: false, code: "VALIDATION_ERROR", message: "Bad", details: [{ path: "note", message: "Required" }] }, 400);
    expect(await recordVerification(ORG_ID, "site", 12, input)).toEqual({ status: "rejected", message: "Bad", fields: { note: "Required" } });
  });

  it("lists attempts, and never shows a malformed list as empty", async () => {
    const attempts = [{ attempt: 1, fix: fix(), verification: verification({ result: "FAIL", note: "Still broken" }) }];
    stubFetch({ success: true, data: { attempts } });
    expect(await listAttempts(ORG_ID, "site", 12)).toEqual({ status: "success", data: attempts });

    stubFetch({ success: true, data: { attempts: [{ attempt: 1, fix: { id: FIX_ID }, verification: null }] } });
    expect((await listAttempts(ORG_ID, "site", 12)).status).toBe("unavailable");
  });
});

describe("preparing a fix and a result", () => {
  it("needs a deployment, and sends a blank note as null", () => {
    expect(prepareFix({ deploymentId: "", note: "" }, "m-1")).toEqual({ errors: { deploymentId: expect.any(String) } });
    expect(prepareFix({ deploymentId: DEP_ID, note: "  " }, "m-1")).toEqual({
      input: { deploymentId: DEP_ID, note: null, clientMutationId: "m-1" },
    });
    expect("errors" in prepareFix({ deploymentId: DEP_ID, note: "x".repeat(5001) }, "m-1")).toBe(true);
  });

  it("needs a result, and a note when it failed", () => {
    expect(prepareTest({ result: "", note: "", deploymentId: DEP_ID }, FIX_ID, "m-2")).toEqual({ errors: { result: expect.any(String) } });
    expect(prepareTest({ result: "FAIL", note: " ", deploymentId: DEP_ID }, FIX_ID, "m-2")).toEqual({ errors: { note: expect.any(String) } });
    expect(prepareTest({ result: "PASS", note: "", deploymentId: DEP_ID }, FIX_ID, "m-2")).toEqual({
      input: { fixSubmissionId: FIX_ID, result: "PASS", note: null, deploymentId: DEP_ID, clientMutationId: "m-2" },
    });
  });

  it("makes an id even without randomUUID", () => {
    expect(newMutationId()).toMatch(/^[0-9a-f-]{36}$/);
    // Shadows the prototype method, as on a page served over plain http.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newMutationId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
    expect(newMutationId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("who can do what", () => {
  const pending = { submittedBy: sachin };

  it("lets only the submitter withdraw", () => {
    expect(canWithdraw(pending, sachin.id)).toBe(true);
    expect(canWithdraw(pending, priya.id)).toBe(false);
    expect(canWithdraw({ submittedBy: null }, null)).toBe(false);
  });

  it("asks someone else to test, unless the submitter is the only member", () => {
    expect(testAccess(pending, priya.id, 2)).toBe("allowed");
    expect(testAccess(pending, sachin.id, 2)).toBe("own-fix");
    expect(testAccess(pending, sachin.id, 1)).toBe("self");
    expect(testAccess(pending, sachin.id, null)).toBe("allowed");
  });
});

describe("retest deployments", () => {
  const base = deployment();
  const newer = deployment({ id: "d-new", label: "v1.6", createdAt: "2026-11-27T09:00:00.000Z" });
  const older = deployment({ id: "d-old", label: "v1.4", createdAt: "2026-11-20T09:00:00.000Z" });
  const elsewhere = deployment({ id: "d-prod", environmentId: "env-2", createdAt: "2026-11-28T09:00:00.000Z" });

  it("orders like the API, ties broken by id", () => {
    expect(isSameOrNewer(newer, base)).toBe(true);
    expect(isSameOrNewer(older, base)).toBe(false);
    expect(isSameOrNewer({ ...base, id: "ffff" }, { ...base, id: "0000" })).toBe(true);
  });

  it("offers the fix's deployment or newer on the same environment", () => {
    expect(retestOptions([newer, base, older, elsewhere], base).map((d) => d.label)).toEqual(["v1.6", "v1.5"]);
    expect(retestOptions([], base)).toEqual([base]);
  });
});

describe("attempts", () => {
  const attempt = (n: number, over: Partial<Attempt> = {}): Attempt =>
    ({ attempt: n, fix: fix({ id: `f-${n}`, attemptNumber: n }), verification: null, ...over }) as Attempt;

  it("names each attempt's state", () => {
    expect(attemptState(attempt(2), "f-2")).toBe("waiting");
    expect(attemptState(attempt(2), null)).toBe("untested");
    expect(attemptState(attempt(1, { verification: verification({ result: "FAIL" }) as Attempt["verification"] }), null)).toBe("failed");
    expect(attemptState(attempt(1, { verification: verification() as Attempt["verification"] }), null)).toBe("passed");
    expect(attemptState(attempt(1, { fix: fix({ id: "f-1", withdrawnAt: "2026-11-26T12:00:00.000Z" }) as Attempt["fix"] }), null)).toBe("withdrawn");
  });

  it("marks an open issue reopened after its last real attempt", () => {
    const failed = attempt(1, { verification: verification({ result: "FAIL" }) as Attempt["verification"] });
    const withdrawn = attempt(2, { fix: fix({ id: "f-2", withdrawnAt: "2026-11-27T12:00:00.000Z" }) as Attempt["fix"] });
    expect(reopenedAfter("IN_PROGRESS", [failed])).toBe(1);
    expect(reopenedAfter("IN_PROGRESS", [withdrawn, failed])).toBe(1);
    expect(reopenedAfter("IN_PROGRESS", [withdrawn])).toBeNull();
    expect(reopenedAfter("READY_FOR_VERIFICATION", [failed])).toBeNull();
  });
});
