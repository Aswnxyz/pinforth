import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/lib/issues/comments-api";
import { closedAs, prepareClose, statusOptions } from "@/lib/issues/lifecycle";
import { describeActivity } from "@/lib/issues/timeline";

/** Pins the transition matrix in docs/contracts/verification-v1.md §5. */

const values = (options: { value: string }[]) => options.map((o) => o.value);

describe("status dropdown", () => {
  it("never offers Ready for verification or Verified as a choice", () => {
    expect(values(statusOptions("NEW"))).toEqual(["NEW", "IN_PROGRESS", "CLOSED"]);
    expect(values(statusOptions("IN_PROGRESS"))).toEqual(["NEW", "IN_PROGRESS", "CLOSED"]);
  });

  it("keeps the current lifecycle status shown, with only the moves the API allows", () => {
    expect(values(statusOptions("READY_FOR_VERIFICATION"))).toEqual(["READY_FOR_VERIFICATION", "CLOSED"]);
    expect(values(statusOptions("VERIFIED"))).toEqual(["IN_PROGRESS", "VERIFIED", "CLOSED"]);
    expect(values(statusOptions("CLOSED"))).toEqual(["IN_PROGRESS", "CLOSED"]);
  });

  it("names going back to In progress as a reopen", () => {
    expect(statusOptions("CLOSED")[0].label).toBe("Reopen (In progress)");
    expect(statusOptions("NEW")[1].label).toBe("In progress");
  });
});

describe("closing", () => {
  it("requires a reason for an unverified issue", () => {
    expect(prepareClose("IN_PROGRESS", { reason: "", note: "" })).toEqual({ errors: { closeReason: expect.any(String) } });
    expect(prepareClose("NEW", { reason: "DUPLICATE", note: " Same as #4 " })).toEqual({
      input: { status: "CLOSED", closeReason: "DUPLICATE", closeNote: "Same as #4" },
    });
  });

  it("requires a note for Other", () => {
    expect(prepareClose("NEW", { reason: "OTHER", note: "  " })).toEqual({ errors: { closeNote: expect.any(String) } });
  });

  it("never sends RESOLVED: the API sets it when a verified issue is closed", () => {
    expect(prepareClose("VERIFIED", { reason: "", note: "" })).toEqual({ input: { status: "CLOSED" } });
    expect(prepareClose("VERIFIED", { reason: "", note: "Shipped" })).toEqual({ input: { status: "CLOSED", closeNote: "Shipped" } });
    expect("errors" in prepareClose("NEW", { reason: "RESOLVED", note: "" })).toBe(true);
  });

  it("limits the note", () => {
    expect("errors" in prepareClose("NEW", { reason: "WONT_FIX", note: "x".repeat(5001) })).toBe(true);
  });

  it("describes a closed issue", () => {
    expect(closedAs({ status: "CLOSED", closeReason: "WONT_FIX" })).toBe("Closed as Won’t fix");
    expect(closedAs({ status: "CLOSED", closeReason: "RESOLVED" })).toBe("Closed as resolved");
    expect(closedAs({ status: "IN_PROGRESS", closeReason: null })).toBeNull();
  });
});

describe("lifecycle history lines", () => {
  const entry = (activityType: string, oldValue: unknown, newValue: unknown): ActivityEntry => ({
    id: "a",
    type: "ACTIVITY",
    activityType,
    actor: null,
    oldValue,
    newValue,
    createdAt: "2026-11-27T10:00:00.000Z",
  });
  const fix = { fixId: "f", attemptNumber: 1, deploymentId: "d", deploymentLabel: "v1.5" };

  it("matches the contract's copy", () => {
    expect(describeActivity(entry("FIX_SUBMITTED", null, fix))).toBe("submitted a fix in v1.5");
    expect(describeActivity(entry("FIX_WITHDRAWN", fix, null))).toBe("withdrew the fix for v1.5");
    expect(describeActivity(entry("VERIFICATION_PASSED", fix, { ...fix, result: "PASS", selfVerified: false }))).toBe("verified the fix on v1.5");
    expect(describeActivity(entry("VERIFICATION_PASSED", fix, { ...fix, result: "PASS", selfVerified: true }))).toBe("verified the fix on v1.5 (self-verified)");
    expect(describeActivity(entry("VERIFICATION_FAILED", fix, { ...fix, result: "FAIL" }))).toBe("marked the fix as failed on v1.5");
    expect(describeActivity(entry("ISSUE_CLOSED", "NEW", { closeReason: "DUPLICATE", closeNote: null }))).toBe("closed this issue as Duplicate");
    expect(describeActivity(entry("ISSUE_CLOSED", "VERIFIED", { closeReason: "RESOLVED", closeNote: "Shipped" }))).toBe("closed this issue as resolved: “Shipped”");
    expect(describeActivity(entry("ISSUE_REOPENED", "CLOSED", "IN_PROGRESS"))).toBe("reopened this issue");
  });

  it("stays readable when a payload is missing", () => {
    expect(describeActivity(entry("FIX_SUBMITTED", null, null))).toBe("submitted a fix in a deployment");
    expect(describeActivity(entry("ISSUE_CLOSED", "NEW", null))).toBe("closed this issue");
  });
});
