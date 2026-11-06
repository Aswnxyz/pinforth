import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGuestInvitation, readInvitationToken } from "@/lib/guest/api";
import {
  createGuestLink,
  createReviewRound,
  listReviewRounds,
  revokeGuestLink,
} from "@/lib/review-rounds/api";
import { adjustActiveLinks } from "@/lib/review-rounds/review-loading";
import {
  describeReviewFailure,
  EMPTY_GUEST_LINK_VALUES,
  toCreateGuestLinkInput,
  toCreateReviewRoundInput,
  UNCONFIRMED_LINK_MESSAGE,
  validateGuestLink,
  validateReviewRound,
} from "@/lib/review-rounds/review-values";

/**
 * These pin the contract with apps/api/src/modules/review-rounds and
 * apps/api/src/modules/guest (docs/contracts/guest-feedback-v1.md).
 */

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder(String(url), init);
    }),
  );
  return calls;
}

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const PROJECT = "client-brand-website";
const BASE = `/api/v1/organizations/${ORG_ID}/projects/${PROJECT}/review-rounds`;
const ENV_ID = "4c424a52-c380-4cf8-a968-380d3211516e";

// As the API returns it, extra keys included.
const round = {
  id: "e6745ba6-df11-4770-9831-a8cfd6f83b10",
  projectId: "7c126d41-e945-4290-8451-b8417934c9f1",
  environmentId: ENV_ID,
  name: "Sprint 14 Client QA",
  description: null,
  status: "ACTIVE" as const,
  environment: { id: ENV_ID, name: "Staging", slug: "staging", url: "https://staging.example.com" },
  activeLinksCount: 0,
  issuesCount: 0,
  createdAt: "2026-11-05T14:30:00.000Z",
  updatedAt: "2026-11-05T14:30:00.000Z",
};

const created = {
  guestLink: {
    id: "a9082006-bb21-4f11-9a70-3847c203b8e2",
    reviewRoundId: round.id,
    reviewerName: "Alice Client",
    reviewerEmail: null,
    expiresAt: "2026-11-12T14:30:00.000Z",
    revokedAt: null,
    createdAt: "2026-11-05T14:30:00.000Z",
  },
  token: "pf_gr_secret",
  invitationUrl: "http://localhost:3000/review#token=pf_gr_secret",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("review round client", () => {
  it("lists rounds", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: { reviewRounds: [round] } }, 200));

    expect(await listReviewRounds(ORG_ID, PROJECT)).toEqual({ status: "success", data: [round] });
    expect(new URL(calls[0].url).pathname).toBe(BASE);
  });

  it("treats a round without counts as unavailable", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { reviewRounds: [{ ...round, issuesCount: undefined }] } }, 200),
    );

    expect((await listReviewRounds(ORG_ID, PROJECT)).status).toBe("unavailable");
  });

  it("creates a round and maps field errors", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [{ path: "environmentId", message: "Invalid environment ID" }],
        },
        400,
      ),
    );

    const input = { name: "Round", environmentId: "nope" };
    expect(await createReviewRound(ORG_ID, PROJECT, input)).toEqual({
      status: "rejected",
      message: "Request validation failed",
      fields: { environmentId: "Invalid environment ID" },
    });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input);
  });

  it("creates a guest link and keeps the one-time URL", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: created }, 201));

    const outcome = await createGuestLink(ORG_ID, PROJECT, round.id, { expiresInDays: 7 });

    expect(outcome.status).toBe("success");
    if (outcome.status === "success") expect(outcome.data.invitationUrl).toBe(created.invitationUrl);
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${round.id}/guest-links`);
  });

  it("revokes a link", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: true, data: { revoked: true, id: created.guestLink.id } }, 200),
    );

    expect((await revokeGuestLink(ORG_ID, PROJECT, round.id, created.guestLink.id)).status).toBe("success");
    expect(calls[0].init.method).toBe("DELETE");
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${round.id}/guest-links/${created.guestLink.id}`);
  });

  it("maps an outage to unavailable, never to a refusal", async () => {
    stubFetch(() => jsonResponse({ success: false, message: "down" }, 503));
    expect((await createGuestLink(ORG_ID, PROJECT, round.id, { expiresInDays: 7 })).status).toBe(
      "unavailable",
    );
  });
});

describe("review form values", () => {
  it("requires a name and a website", () => {
    expect(validateReviewRound({ name: "  ", environmentId: "", description: "" })).toEqual({
      name: "Name is required.",
      environmentId: "Choose the website to review.",
    });
    expect(validateReviewRound({ name: "R", environmentId: ENV_ID, description: "" })).toEqual({});
  });

  it("leaves an empty description out of the POST", () => {
    expect(toCreateReviewRoundInput({ name: " R ", environmentId: ENV_ID, description: "  " })).toEqual({
      name: "R",
      environmentId: ENV_ID,
    });
  });

  it("allows an anonymous link but checks a given email", () => {
    expect(validateGuestLink(EMPTY_GUEST_LINK_VALUES)).toEqual({});
    expect(validateGuestLink({ ...EMPTY_GUEST_LINK_VALUES, reviewerEmail: "nope" }).reviewerEmail).toBeDefined();
    expect(validateGuestLink({ ...EMPTY_GUEST_LINK_VALUES, expiresInDays: 365 }).expiresInDays).toBeDefined();
    expect(toCreateGuestLinkInput(EMPTY_GUEST_LINK_VALUES)).toEqual({ expiresInDays: 7 });
    expect(
      toCreateGuestLinkInput({ reviewerName: " Alice ", reviewerEmail: " a@x.com ", expiresInDays: 3 }),
    ).toEqual({ reviewerName: "Alice", reviewerEmail: "a@x.com", expiresInDays: 3 });
  });

  it("keeps an unknown outcome distinct from a refusal", () => {
    expect(describeReviewFailure({ status: "unavailable", message: "x" }, UNCONFIRMED_LINK_MESSAGE)).toEqual({
      kind: "refresh",
      message: UNCONFIRMED_LINK_MESSAGE,
    });
    expect(describeReviewFailure({ status: "not-found" }, "x")).toEqual({ kind: "gone" });
  });

  it("adjusts one round's active links, never below zero", () => {
    const rounds = [round, { ...round, id: "other" }];
    expect(adjustActiveLinks(rounds, round.id, 1).map((r) => r.activeLinksCount)).toEqual([1, 0]);
    expect(adjustActiveLinks(rounds, round.id, -1)[0].activeLinksCount).toBe(0);
  });
});

describe("guest invitation", () => {
  const token = "pf_gr_AbCdEfGhIjKlMnOpQrStUvWxYz012345";

  it("reads the secret from the fragment only when it is shaped like one", () => {
    expect(readInvitationToken(`#token=${token}`)).toBe(token);
    expect(readInvitationToken(`token=${token}`)).toBe(token);
    expect(readInvitationToken("")).toBeNull();
    expect(readInvitationToken("#token=")).toBeNull();
    expect(readInvitationToken("#token=pf_hc_AbCdEfGhIjKlMnOpQr")).toBeNull();
    expect(readInvitationToken("#token=pf_gr_<script>")).toBeNull();
  });

  const handoff = {
    handoffCode: "pf_hc_code",
    targetUrl: "https://staging.example.com",
    stagingUrl: "https://staging.example.com/#pf_handoff=pf_hc_code",
    expiresAt: "2026-11-05T14:40:00.000Z",
    reviewRound: { id: round.id, name: round.name },
    reviewer: { name: "Alice Client", email: null },
  };

  it("exchanges the secret without trying a session refresh", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: handoff }, 200));

    expect(await exchangeGuestInvitation(token)).toEqual({
      status: "success",
      data: {
        stagingUrl: handoff.stagingUrl,
        reviewRound: handoff.reviewRound,
        reviewer: handoff.reviewer,
      },
    });
    expect(new URL(calls[0].url).pathname).toBe("/api/v1/guest/reviews/exchange");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token });
  });

  it("never follows a handoff URL that isn't a website with the code", async () => {
    for (const stagingUrl of ["javascript:alert(1)//#pf_handoff=x", "https://staging.example.com/"]) {
      stubFetch(() => jsonResponse({ success: true, data: { ...handoff, stagingUrl } }, 200));
      expect((await exchangeGuestInvitation(token)).status).toBe("unavailable");
    }
  });

  it("maps an expired link, a closed round and an outage", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ success: false, code: "UNAUTHORIZED", message: "Review invitation has expired" }, 401),
    );
    expect(await exchangeGuestInvitation(token)).toEqual({
      status: "denied",
      message: "Review invitation has expired",
    });
    // A guest link's 401 must not set off the signed-in session refresh.
    expect(calls).toHaveLength(1);

    stubFetch(() => jsonResponse({ success: false, message: "Review round is not active" }, 403));
    expect((await exchangeGuestInvitation(token)).status).toBe("closed");

    stubFetch(() => jsonResponse({ success: false, message: "down" }, 500));
    expect((await exchangeGuestInvitation(token)).status).toBe("unavailable");
  });
});
