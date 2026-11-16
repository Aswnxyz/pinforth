import { afterEach, describe, expect, it, vi } from "vitest";
import { listEnvironmentGuestLinks, type EnvironmentGuestLink } from "@/lib/review-rounds/api";
import {
  markRevoked,
  reviewerActivityLine,
  reviewerName,
  reviewersSummary,
  splitReviewers,
} from "@/lib/review-rounds/reviewers";

/** Pins section 3.5 of docs/contracts/guest-feedback-v1.md. */

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const ENV_ID = "4c424a52-c380-4cf8-a968-380d3211516e";

const link = (over: Partial<EnvironmentGuestLink> = {}): EnvironmentGuestLink => ({
  id: "a9082006-bb21-4f11-9a70-3847c203b8e2",
  reviewRoundId: "e6745ba6-df11-4770-9831-a8cfd6f83b10",
  reviewerName: "Alice",
  reviewerEmail: null,
  status: "ACTIVE",
  expiresAt: "2026-11-19T14:30:00.000Z",
  revokedAt: null,
  createdAt: "2026-11-12T14:30:00.000Z",
  lastOpenedAt: null,
  issuesCount: 0,
  ...over,
});

function stubFetch(body: unknown, status = 200) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("listEnvironmentGuestLinks", () => {
  it("reads the environment's links", async () => {
    const urls = stubFetch({ success: true, data: { guestLinks: [link()] } });
    const outcome = await listEnvironmentGuestLinks(ORG_ID, "site", ENV_ID);

    expect(outcome).toEqual({ status: "success", data: [link()] });
    expect(urls[0]).toContain(
      `/api/v1/organizations/${ORG_ID}/projects/site/environments/${ENV_ID}/guest-links`,
    );
  });

  it("treats a malformed list as unavailable, never as empty", async () => {
    stubFetch({ success: true, data: { guestLinks: [{ ...link(), status: "PAUSED" }] } });
    const outcome = await listEnvironmentGuestLinks(ORG_ID, "site", ENV_ID);
    expect(outcome.status).toBe("unavailable");
  });

  it("maps a 404 to not-found", async () => {
    stubFetch({ success: false, error: { code: "NOT_FOUND", message: "Environment not found" } }, 404);
    expect((await listEnvironmentGuestLinks(ORG_ID, "site", ENV_ID)).status).toBe("not-found");
  });
});

describe("reviewer helpers", () => {
  it("names a reviewer by name, then email, then a fallback", () => {
    expect(reviewerName(link())).toBe("Alice");
    expect(reviewerName(link({ reviewerName: null, reviewerEmail: "a@x.co" }))).toBe("a@x.co");
    expect(reviewerName(link({ reviewerName: null }))).toBe("Unnamed reviewer");
  });

  it("splits working links from past ones", () => {
    const { active, past } = splitReviewers([
      link({ id: "1" }),
      link({ id: "2", status: "EXPIRED" }),
      link({ id: "3", status: "REVOKED" }),
    ]);
    expect(active.map((l) => l.id)).toEqual(["1"]);
    expect(past.map((l) => l.id)).toEqual(["2", "3"]);
  });

  it("describes site activity and counts issues", () => {
    expect(reviewerActivityLine(link())).toBe("Not on the site yet · 0 issues");
    expect(reviewerActivityLine(link({ lastOpenedAt: "2026-11-14T12:30:00.000Z", issuesCount: 1 }))).toMatch(
      /^Last on the site .+ · 1 issue$/,
    );
  });

  it("summarises the active count", () => {
    expect(reviewersSummary(0)).toBe("No active reviewers");
    expect(reviewersSummary(1)).toBe("1 active reviewer");
    expect(reviewersSummary(3)).toBe("3 active reviewers");
  });

  it("marks only the revoked link, and keeps an earlier revocation time", () => {
    const at = "2026-11-14T10:00:00.000Z";
    const earlier = link({ id: "2", status: "REVOKED", revokedAt: "2026-11-01T00:00:00.000Z" });
    const result = markRevoked([link({ id: "1" }), earlier], "1", at);
    expect(result[0]).toMatchObject({ status: "REVOKED", revokedAt: at });
    expect(markRevoked([earlier], "2", at)[0]).toBe(earlier);
  });
});
