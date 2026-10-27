import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MembersList } from "@/components/members/members-list";
import { MemberRoleEditor } from "@/components/members/member-role-editor";
import { MemberRemovalCard } from "@/components/members/member-removal-card";
import { LeaveOrganization } from "@/components/members/leave-organization";
import { MembersEntry } from "@/components/workspace/members-entry";
import { canManageMembers } from "@/lib/organizations/organization-access";
import { describeMemberFailure } from "@/lib/members/member-failure";
import {
  LAST_OWNER_LEAVE_MESSAGE,
  LAST_OWNER_REMOVAL_MESSAGE,
  UNCONFIRMED_LEAVE_MESSAGE,
  UNCONFIRMED_REMOVAL_MESSAGE,
  canRemoveMember,
  createSubmissionLock,
  isSoleOwnerLeaving,
  memberIsGone,
  memberRemovedNotice,
  organizationIsGone,
} from "@/lib/members/member-removal";
import {
  LAST_OWNER_MESSAGE,
  ROLE_CHANGE_NOT_SAVED_MESSAGE,
  UNCONFIRMED_ROLE_CHANGE_MESSAGE,
  describeRoleChangeFailure,
  replaceMember,
  roleChangeConfirmation,
  roleChangeConfirmationMessage,
  roleChangeLanded,
} from "@/lib/members/member-role";
import {
  changeMemberRole,
  listMembers,
  removeMember,
  type OrganizationMember,
} from "@/lib/organizations/members-api";
import {
  loadMemberList,
  resolveMemberListState,
  type MemberListState,
} from "@/lib/members/member-list";
import { createRequestGuard } from "@/lib/projects/project-detail";

const ORG_ID = "8f1c0f4e-2b6a-4a2f-9d1e-3c5b7a9e0d11";
const MEMBER_ID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const USER_ID = "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const BASE = `/api/v1/organizations/${ORG_ID}/members`;
const NETWORK_MESSAGE =
  "Unable to connect to the server. Please check your connection and try again.";

const member: OrganizationMember = {
  id: MEMBER_ID,
  role: "OWNER",
  joinedAt: "2026-10-01T09:00:00.000Z",
  user: {
    id: USER_ID,
    name: "Ada Lovelace",
    email: "ada@example.com",
  },
  isYou: true,
};

const colleague: OrganizationMember = {
  id: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
  role: "MEMBER",
  joinedAt: "2026-10-02T10:30:00.000Z",
  user: {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    name: "Grace Hopper",
    email: "grace@example.com",
  },
  isYou: false,
};

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }),
  );

  return calls;
}

const membersResponse = (members: unknown) =>
  jsonResponse({ success: true, data: { members } }, 200);

describe("listMembers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists members with a credentialed GET to the organization's backend id", async () => {
    const calls = stubFetch(() => membersResponse([member, colleague]));

    const outcome = await listMembers(ORG_ID);

    expect(outcome).toEqual({
      status: "success",
      data: [member, colleague],
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("keeps an empty member list as a valid success", async () => {
    stubFetch(() => membersResponse([]));

    await expect(listMembers(ORG_ID)).resolves.toEqual({
      status: "success",
      data: [],
    });
  });

  it("never turns a malformed member list into an empty list", async () => {
    stubFetch(() => membersResponse([{}]));

    await expect(listMembers(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("rejects a member without a valid role", async () => {
    const memberWithoutRole = { ...member, role: undefined };
    stubFetch(() => membersResponse([memberWithoutRole]));

    await expect(listMembers(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("rejects a member without an isYou flag", async () => {
    const memberWithoutIsYou = { ...member, isYou: undefined };
    stubFetch(() => membersResponse([memberWithoutIsYou]));

    await expect(listMembers(ORG_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("preserves membership ids, user ids and isYou flags", async () => {
    stubFetch(() => membersResponse([member, colleague]));

    const outcome = await listMembers(ORG_ID);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;

    expect(outcome.data[0]?.id).toBe(MEMBER_ID);
    expect(outcome.data[0]?.user.id).toBe(USER_ID);
    expect(outcome.data[0]?.isYou).toBe(true);
    expect(outcome.data[1]?.id).toBe(colleague.id);
    expect(outcome.data[1]?.user.id).toBe(colleague.user.id);
    expect(outcome.data[1]?.isYou).toBe(false);
    expect(outcome.data[0]?.id).not.toBe(outcome.data[0]?.user.id);
  });

  it("reports a confirmed unauthorized session", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: false, code: "UNAUTHORIZED", message: "Session has ended" },
        401,
      ),
    );

    await expect(listMembers(ORG_ID)).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("reports a network failure as unavailable, never as a logout", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(listMembers(ORG_ID)).resolves.toEqual({
      status: "unavailable",
      code: "NETWORK_ERROR",
      message: NETWORK_MESSAGE,
    });
  });

  it("reports a server outage as unavailable", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "INTERNAL_ERROR",
          message: "Something went wrong",
        },
        500,
      ),
    );

    await expect(listMembers(ORG_ID)).resolves.toEqual({
      status: "unavailable",
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  });
});

describe("changeMemberRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("patches the membership endpoint with only the new role", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          success: true,
          data: { member: { ...member, role: "ADMIN", isYou: false } },
        },
        200,
      ),
    );

    const outcome = await changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN");

    expect(outcome).toEqual({
      status: "success",
      data: { ...member, role: "ADMIN", isYou: false },
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${MEMBER_ID}`);
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].init.credentials).toBe("include");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ role: "ADMIN" });
  });

  it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
    "sends the %s role",
    async (role) => {
      const calls = stubFetch(() =>
        jsonResponse(
          { success: true, data: { member: { ...member, role } } },
          200,
        ),
      );

      const outcome = await changeMemberRole(ORG_ID, MEMBER_ID, role);

      expect(outcome).toMatchObject({
        status: "success",
        data: { role },
      });
      expect(JSON.parse(String(calls[0].init.body))).toEqual({ role });
    },
  );

  it("maps a forbidden role change without replacing backend authorization", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "FORBIDDEN",
          message: "Your role in this organization doesn't allow this",
        },
        403,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toEqual({
      status: "forbidden",
      message: "Your role in this organization doesn't allow this",
    });
  });

  it("maps a validation failure to the role field", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [{ path: "role", message: "Invalid role" }],
        },
        400,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toEqual({
      status: "rejected",
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      fields: { role: "Invalid role" },
    });
  });

  it("maps an unknown or inaccessible member to not-found", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: false, code: "NOT_FOUND", message: "Member not found" },
        404,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toEqual({
      status: "not-found",
    });
  });

  it("preserves the last-owner conflict code", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "LAST_OWNER",
          message:
            "An organization needs at least one owner. Make someone else an owner first",
        },
        409,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toEqual({
      status: "last-owner",
      code: "LAST_OWNER",
      message:
        "An organization needs at least one owner. Make someone else an owner first",
    });
  });

  it("maps any other conflict separately from LAST_OWNER", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "CONFLICT",
          message: "The membership changed",
        },
        409,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toEqual({
      status: "conflict",
      code: "CONFLICT",
      message: "The membership changed",
    });
  });

  it("treats a malformed successful response as unavailable, not success", async () => {
    stubFetch(() =>
      jsonResponse({ success: true, data: { member: {} } }, 200),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("does not retry a role change after a network failure", async () => {
    const calls = stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(calls).toHaveLength(1);
  });

  it("does not retry a role change after a server error", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "INTERNAL_ERROR",
          message: "Something went wrong",
        },
        500,
      ),
    );

    await expect(
      changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN"),
    ).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("removeMember", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes by membership id, not by user id", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        { success: true, data: { memberId: MEMBER_ID }, message: "Member removed" },
        200,
      ),
    );

    await removeMember(ORG_ID, MEMBER_ID);

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(`${BASE}/${MEMBER_ID}`);
    expect(new URL(calls[0].url).pathname).not.toBe(`${BASE}/${USER_ID}`);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("returns the backend's confirmed member id", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: true, data: { memberId: MEMBER_ID }, message: "Member removed" },
        200,
      ),
    );

    await expect(removeMember(ORG_ID, MEMBER_ID)).resolves.toEqual({
      status: "success",
      data: { memberId: MEMBER_ID },
    });
  });

  it("preserves the last-owner conflict when leaving", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "LAST_OWNER",
          message:
            "An organization needs at least one owner. Make someone else an owner first",
        },
        409,
      ),
    );

    await expect(removeMember(ORG_ID, MEMBER_ID)).resolves.toEqual({
      status: "last-owner",
      code: "LAST_OWNER",
      message:
        "An organization needs at least one owner. Make someone else an owner first",
    });
  });

  it("maps a forbidden removal", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          success: false,
          code: "FORBIDDEN",
          message: "Your role in this organization doesn't allow removing this member",
        },
        403,
      ),
    );

    await expect(removeMember(ORG_ID, MEMBER_ID)).resolves.toEqual({
      status: "forbidden",
      message:
        "Your role in this organization doesn't allow removing this member",
    });
  });

  it("treats a malformed successful response as unavailable, not a confirmed removal", async () => {
    stubFetch(() => jsonResponse({ success: true, data: {} }, 200));

    await expect(removeMember(ORG_ID, MEMBER_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("does not retry a removal after a lost network response", async () => {
    const calls = stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(removeMember(ORG_ID, MEMBER_ID)).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("member paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes dynamic organization and membership path segments", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        { success: true, data: { member: { ...member, role: "ADMIN" } } },
        200,
      ),
    );

    await changeMemberRole("org/one", "member/two", "ADMIN");

    expect(new URL(calls[0].url).pathname).toBe(
      "/api/v1/organizations/org%2Fone/members/member%2Ftwo",
    );
  });
});

/**
 * The members page: how a `listMembers` outcome becomes a renderable state,
 * how the page pattern (guard + request key) keeps a superseded
 * organization's response from ever writing state, and what the presentational
 * list shows.
 */

const OTHER_ORG_ID = "9d8c7b6a-5e4f-4a3b-2c1d-0e9f8a7b6c5d";

const formatJoined = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const renderMembers = (
  members: OrganizationMember[],
  props: {
    canEdit?: boolean;
    onEdit?: (member: OrganizationMember) => void;
    canRemove?: (member: OrganizationMember) => boolean;
    onRemove?: (member: OrganizationMember) => void;
  } = {},
) => renderToStaticMarkup(createElement(MembersList, { members, ...props }));

describe("resolveMemberListState", () => {
  it("keeps a confirmed populated list, passing backend order through", () => {
    expect(
      resolveMemberListState({ status: "success", data: [member, colleague] }),
    ).toEqual({ kind: "ready", members: [member, colleague] });
  });

  it("keeps a confirmed empty list as ready — the only source of the empty state", () => {
    expect(resolveMemberListState({ status: "success", data: [] })).toEqual({
      kind: "ready",
      members: [],
    });
  });

  it("maps a 404 to not-found, never to an empty list", () => {
    expect(resolveMemberListState({ status: "not-found" })).toEqual({
      kind: "not-found",
    });
  });

  it("maps a forbidden list to forbidden with the backend message", () => {
    expect(
      resolveMemberListState({
        status: "forbidden",
        message: "Your role does not allow this",
      }),
    ).toEqual({
      kind: "forbidden",
      message: "Your role does not allow this",
    });
  });

  it("maps an outage to unavailable — retryable, and never a logout", () => {
    expect(
      resolveMemberListState({ status: "unavailable", message: "down" }),
    ).toEqual({ kind: "unavailable", message: "down" });
  });

  it("treats rejected, conflicting and last-owner answers as unavailable", () => {
    expect(
      resolveMemberListState({ status: "rejected", message: "nope" }).kind,
    ).toBe("unavailable");
    expect(
      resolveMemberListState({ status: "conflict", message: "nope" }).kind,
    ).toBe("unavailable");
    expect(
      resolveMemberListState({
        status: "last-owner",
        message: "nope",
        code: "LAST_OWNER",
      }).kind,
    ).toBe("unavailable");
  });

  it("asks the page to sign in only for a confirmed invalid session", () => {
    expect(resolveMemberListState({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });
});

describe("loadMemberList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the organization's member endpoint by backend id", async () => {
    const calls = stubFetch(() => membersResponse([member, colleague]));

    await expect(loadMemberList(ORG_ID)).resolves.toEqual({
      kind: "ready",
      members: [member, colleague],
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(BASE);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("issues a fresh GET on every call, so Retry never reuses a response", async () => {
    const calls = stubFetch(() => membersResponse([]));

    await loadMemberList(ORG_ID);
    await loadMemberList(ORG_ID);

    expect(calls).toHaveLength(2);
  });

  it("never turns a malformed response into an empty list", async () => {
    stubFetch(() => membersResponse([{}]));

    await expect(loadMemberList(ORG_ID)).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("maps a network failure to unavailable, never to login or empty", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(loadMemberList(ORG_ID)).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("never writes a superseded organization's late response", async () => {
    // Mirrors the page: an org switch mid-flight starts a second request,
    // and only the newest token may write state. Both responses arrive
    // afterwards; the older one must be dropped, so one workspace's members
    // can never render under another.
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const guard = createRequestGuard();
    const writes: Array<{ token: number; state: MemberListState }> = [];

    const request = (orgId: string) => {
      const token = guard.start();
      return loadMemberList(orgId).then((state) => {
        if (guard.accept(token)) writes.push({ token, state });
      });
    };

    const oldRequest = request(ORG_ID);
    const newRequest = request(OTHER_ORG_ID);

    // Let both requests reach the network before answering either.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvers).toHaveLength(2);
    // Each request addressed its own organization by backend id.
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(BASE);
    expect(new URL(String(fetchMock.mock.calls[1][0])).pathname).toBe(
      `/api/v1/organizations/${OTHER_ORG_ID}/members`,
    );

    resolvers[0](membersResponse([member]));
    resolvers[1](
      membersResponse([
        { ...colleague, user: { ...colleague.user, name: "Other Workspace" } },
      ]),
    );

    await Promise.all([oldRequest, newRequest]);

    // Only the newest request wrote, and it wrote its own workspace's data.
    expect(writes).toHaveLength(1);
    expect(writes[0].state).toMatchObject({
      kind: "ready",
      members: [{ user: { name: "Other Workspace" } }],
    });
  });
});

describe("MembersList", () => {
  it("shows each member's name, email, role and join date", () => {
    const html = renderMembers([member, colleague]);

    expect(html).toContain(member.user.name);
    expect(html).toContain(member.user.email);
    expect(html).toContain(colleague.user.name);
    expect(html).toContain(colleague.user.email);
    expect(html).toContain(">Owner</span>");
    expect(html).toContain(">Member</span>");
    expect(html).toContain(`Joined ${formatJoined(member.joinedAt)}`);
    expect(html).toContain(`Joined ${formatJoined(colleague.joinedAt)}`);
  });

  it("marks only the signed-in member with (You)", () => {
    const html = renderMembers([member, colleague]);

    expect(html.split("(You)")).toHaveLength(2);
    expect(html.indexOf("(You)")).toBeGreaterThan(html.indexOf(member.user.name));
    expect(html.indexOf("(You)")).toBeLessThan(html.indexOf(colleague.user.name));
  });

  it("keeps the backend's oldest-first order", () => {
    const html = renderMembers([member, colleague]);

    expect(html.indexOf(member.user.name)).toBeLessThan(
      html.indexOf(colleague.user.name),
    );
  });

  it("labels every role the backend can return", () => {
    const html = renderMembers([
      member,
      { ...member, id: "admin-id", role: "ADMIN", isYou: false },
      { ...member, id: "member-id", role: "MEMBER", isYou: false },
    ]);

    expect(html).toContain(">Owner</span>");
    expect(html).toContain(">Admin</span>");
    expect(html).toContain(">Member</span>");
  });

  it("renders an empty state only when given a confirmed empty list", () => {
    const html = renderMembers([]);

    expect(html).toContain("No team members");
    expect(html).not.toContain(member.user.name);
  });

  it("offers an Edit role action only when the caller may edit", () => {
    expect(renderMembers([member, colleague])).not.toContain("Edit role");

    const html = renderMembers([member, colleague], {
      canEdit: true,
      onEdit: () => {},
    });

    expect(html).toContain(`Edit role for ${member.user.name}`);
    expect(html).toContain(`Edit role for ${colleague.user.name}`);
  });
});

/**
 * Role management: who may edit, what needs confirmation, how a failed PATCH
 * is explained, and how a backend-confirmed or freshly read role is
 * reconciled into the list.
 */

describe("canManageMembers", () => {
  it("lets only OWNERs change roles", () => {
    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("ADMIN")).toBe(false);
    expect(canManageMembers("MEMBER")).toBe(false);
  });
});

describe("roleChangeConfirmation", () => {
  it("asks for no confirmation for an ordinary role change", () => {
    expect(
      roleChangeConfirmation({ ...colleague, role: "MEMBER" }, "ADMIN"),
    ).toBe("none");
  });

  it("requires confirmation before granting OWNER to someone else", () => {
    expect(roleChangeConfirmation(colleague, "OWNER")).toBe("grant-owner");
  });

  it("requires confirmation before an OWNER steps down", () => {
    expect(roleChangeConfirmation(member, "ADMIN")).toBe("self-demotion");
    expect(roleChangeConfirmation(member, "MEMBER")).toBe("self-demotion");
  });

  it("treats reselecting the current role as no change at all", () => {
    expect(roleChangeConfirmation(member, "OWNER")).toBe("none");
    expect(roleChangeConfirmation(colleague, "MEMBER")).toBe("none");
  });

  it("names the person and the consequences in each confirmation", () => {
    expect(roleChangeConfirmationMessage("grant-owner", colleague, "OWNER")).toContain(
      colleague.user.name,
    );
    expect(
      roleChangeConfirmationMessage("self-demotion", member, "ADMIN"),
    ).toContain("lose owner access");
    expect(roleChangeConfirmationMessage("none", member, "OWNER")).toBeNull();
  });
});

describe("describeRoleChangeFailure", () => {
  it("sends a confirmed invalid session to sign in", () => {
    expect(describeRoleChangeFailure({ status: "unauthorized" })).toEqual({
      kind: "login",
    });
  });

  it("treats a permission change as access, never as an expired session", () => {
    expect(
      describeRoleChangeFailure({
        status: "forbidden",
        message: "Your role in this organization doesn't allow this",
      }),
    ).toEqual({
      kind: "access",
      message: "Your role in this organization doesn't allow this",
    });
  });

  it("treats a removed or unknown member as gone", () => {
    expect(describeRoleChangeFailure({ status: "not-found" })).toEqual({
      kind: "gone",
    });
  });

  it("explains the last-owner rule in its own words", () => {
    expect(
      describeRoleChangeFailure({
        status: "last-owner",
        message: "An organization needs at least one owner",
        code: "LAST_OWNER",
      }),
    ).toEqual({ kind: "message", message: LAST_OWNER_MESSAGE });
  });

  it("keeps a validation or conflict message from the backend", () => {
    expect(
      describeRoleChangeFailure({ status: "rejected", message: "Invalid role" }),
    ).toEqual({ kind: "message", message: "Invalid role" });
    expect(
      describeRoleChangeFailure({ status: "conflict", message: "Changed already" }),
    ).toEqual({ kind: "message", message: "Changed already" });
  });

  it("treats an unanswered or malformed PATCH as unconfirmed, never as a retry", () => {
    expect(
      describeRoleChangeFailure({ status: "unavailable", message: "down" }),
    ).toEqual({ kind: "refresh", message: UNCONFIRMED_ROLE_CHANGE_MESSAGE });
  });
});

describe("role reconciliation", () => {
  it("replaces exactly the confirmed member and keeps the backend order", () => {
    const updated = { ...colleague, role: "ADMIN" as const };

    expect(replaceMember([member, colleague], updated)).toEqual([
      member,
      updated,
    ]);
  });

  it("never invents a member the list does not contain", () => {
    const updated = { ...colleague, role: "ADMIN" as const };

    expect(replaceMember([member], updated)).toEqual([member]);
  });

  it("recognises a landed change only from the target membership's role", () => {
    const updated = [{ ...member }, { ...colleague, role: "ADMIN" as const }];

    expect(roleChangeLanded(updated, colleague.id, "ADMIN")).toBe(true);
    expect(roleChangeLanded(updated, colleague.id, "OWNER")).toBe(false);
    expect(roleChangeLanded(updated, "unknown-id", "ADMIN")).toBe(false);
  });

  it("reconciles an unconfirmed PATCH through a fresh GET", async () => {
    // The PATCH loses its answer, so nothing may be claimed yet.
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(changeMemberRole(ORG_ID, colleague.id, "ADMIN")).resolves.toMatchObject(
      { status: "unavailable" },
    );

    // The fresh GET is authoritative: the role did land.
    vi.unstubAllGlobals();
    stubFetch(() => membersResponse([member, { ...colleague, role: "ADMIN" }]));
    const fresh = await loadMemberList(ORG_ID);

    expect(fresh.kind).toBe("ready");
    if (fresh.kind !== "ready") return;
    expect(roleChangeLanded(fresh.members, colleague.id, "ADMIN")).toBe(true);
  });

  it("shows the unconfirmed change was not saved when a fresh GET disagrees", async () => {
    stubFetch(() => membersResponse([member, colleague]));
    const fresh = await loadMemberList(ORG_ID);

    expect(fresh.kind).toBe("ready");
    if (fresh.kind !== "ready") return;
    expect(roleChangeLanded(fresh.members, colleague.id, "ADMIN")).toBe(false);
    expect(ROLE_CHANGE_NOT_SAVED_MESSAGE).toContain("not saved");
  });
});

describe("role-change request safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never repeats a role PATCH after a lost response", async () => {
    const calls = stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(changeMemberRole(ORG_ID, MEMBER_ID, "ADMIN")).resolves.toMatchObject(
      { status: "unavailable" },
    );
    expect(calls).toHaveLength(1);
  });

  it("never applies a superseded organization's late role change", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const guard = createRequestGuard();
    const writes: string[] = [];

    const request = (orgId: string, memberId: string) => {
      const token = guard.start();
      return changeMemberRole(orgId, memberId, "ADMIN").then((outcome) => {
        if (guard.accept(token)) writes.push(`${orgId}:${outcome.status}`);
      });
    };

    const oldRequest = request(ORG_ID, MEMBER_ID);
    const newRequest = request(OTHER_ORG_ID, colleague.id);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvers).toHaveLength(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(
      `${BASE}/${MEMBER_ID}`,
    );
    expect(new URL(String(fetchMock.mock.calls[1][0])).pathname).toBe(
      `/api/v1/organizations/${OTHER_ORG_ID}/members/${colleague.id}`,
    );

    resolvers[1](
      jsonResponse(
        { success: true, data: { member: { ...colleague, role: "ADMIN" } } },
        200,
      ),
    );
    resolvers[0](
      jsonResponse(
        { success: true, data: { member: { ...member, role: "ADMIN" } } },
        200,
      ),
    );

    await Promise.all([oldRequest, newRequest]);

    expect(writes).toEqual([`${OTHER_ORG_ID}:success`]);
  });
});

describe("MemberRoleEditor", () => {
  const renderEditor = (editorMember: OrganizationMember) =>
    renderToStaticMarkup(
      createElement(MemberRoleEditor, {
        member: editorMember,
        onSubmit: () => {},
        onCancel: () => {},
        pending: false,
        message: null,
      }),
    );

  it("shows who is being edited and preselects the current role", () => {
    const html = renderEditor(colleague);

    expect(html).toContain(colleague.user.name);
    expect(html).toContain(colleague.user.email);
    expect(html).toContain(">Member</option>");
    expect(html).toContain(">Admin</option>");
    expect(html).toContain(">Owner</option>");
    expect(html).toMatch(/<option[^>]*value="MEMBER"[^>]*selected/);
  });

  it("offers every role and disables Save until the role changes", () => {
    const html = renderEditor(colleague);

    expect(html).toContain('value="OWNER"');
    expect(html).toContain('value="ADMIN"');
    expect(html).toContain('value="MEMBER"');
    expect(html).toMatch(/disabled=""[^>]*>Save changes/);
  });

  it("shows an error without losing the editor or its selection", () => {
    const html = renderToStaticMarkup(
      createElement(MemberRoleEditor, {
        member: colleague,
        onSubmit: () => {},
        onCancel: () => {},
        pending: false,
        message: ROLE_CHANGE_NOT_SAVED_MESSAGE,
        onRefreshMembers: () => {},
      }),
    );

    expect(html).toContain(ROLE_CHANGE_NOT_SAVED_MESSAGE);
    expect(html).toContain("Refresh members");
    expect(html).toContain(">Member</option>");
  });

  it("offers an access refresh without pretending the session ended", () => {
    const html = renderToStaticMarkup(
      createElement(MemberRoleEditor, {
        member: colleague,
        onSubmit: () => {},
        onCancel: () => {},
        pending: false,
        message: "Your role in this organization doesn't allow this",
        onRefreshAccess: () => {},
      }),
    );

    expect(html).toContain("Refresh access");
    expect(html).not.toContain("sign in");
  });
});

/**
 * Removal and leaving: who may remove whom, how the confirmations read, and
 * how a fresh GET or organization list settles an unconfirmed DELETE.
 */

const adminMember: OrganizationMember = {
  ...colleague,
  id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
  role: "ADMIN",
  user: {
    id: "4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a",
    name: "Katherine Johnson",
    email: "katherine@example.com",
  },
};

describe("canRemoveMember", () => {
  it("lets an OWNER remove another member of any role", () => {
    expect(canRemoveMember("OWNER", colleague)).toBe(true);
    expect(canRemoveMember("OWNER", adminMember)).toBe(true);
  });

  it("lets an ADMIN remove MEMBERs only", () => {
    expect(canRemoveMember("ADMIN", colleague)).toBe(true);
    expect(canRemoveMember("ADMIN", adminMember)).toBe(false);
    expect(canRemoveMember("ADMIN", { ...member, isYou: false })).toBe(false);
  });

  it("lets a MEMBER remove nobody", () => {
    expect(canRemoveMember("MEMBER", colleague)).toBe(false);
    expect(canRemoveMember("MEMBER", adminMember)).toBe(false);
  });

  it("never offers row removal for the signed-in member", () => {
    expect(canRemoveMember("OWNER", member)).toBe(false);
  });
});

describe("isSoleOwnerLeaving", () => {
  it("recognises the only OWNER as blocked from leaving", () => {
    expect(isSoleOwnerLeaving([member], member.id)).toBe(true);
    expect(isSoleOwnerLeaving([member, colleague], member.id)).toBe(true);
  });

  it("allows an OWNER once another OWNER exists", () => {
    const otherOwner = { ...colleague, role: "OWNER" as const };

    expect(isSoleOwnerLeaving([member, otherOwner], member.id)).toBe(false);
  });

  it("never blocks a non-owner", () => {
    expect(isSoleOwnerLeaving([member, colleague], colleague.id)).toBe(false);
  });
});

describe("describeMemberFailure", () => {
  const options = {
    lastOwnerMessage: LAST_OWNER_REMOVAL_MESSAGE,
    unconfirmedMessage: UNCONFIRMED_REMOVAL_MESSAGE,
  };

  it("sends a confirmed invalid session to sign in", () => {
    expect(describeMemberFailure({ status: "unauthorized" }, options)).toEqual({
      kind: "login",
    });
  });

  it("treats a permission change as access", () => {
    expect(
      describeMemberFailure(
        { status: "forbidden", message: "Your role in this organization doesn't allow removing this member" },
        options,
      ),
    ).toEqual({
      kind: "access",
      message: "Your role in this organization doesn't allow removing this member",
    });
  });

  it("treats a missing member as gone", () => {
    expect(describeMemberFailure({ status: "not-found" }, options)).toEqual({
      kind: "gone",
    });
  });

  it("explains the last-owner rule in the caller's words", () => {
    expect(
      describeMemberFailure(
        { status: "last-owner", message: "An organization needs at least one owner", code: "LAST_OWNER" },
        options,
      ),
    ).toEqual({ kind: "message", message: LAST_OWNER_REMOVAL_MESSAGE });
  });

  it("keeps backend validation and conflict messages", () => {
    expect(
      describeMemberFailure({ status: "rejected", message: "Cannot remove" }, options),
    ).toEqual({ kind: "message", message: "Cannot remove" });
    expect(
      describeMemberFailure({ status: "conflict", message: "Changed already" }, options),
    ).toEqual({ kind: "message", message: "Changed already" });
  });

  it("treats an unanswered DELETE as unconfirmed, never as done", () => {
    expect(
      describeMemberFailure({ status: "unavailable", message: "down" }, options),
    ).toEqual({ kind: "refresh", message: UNCONFIRMED_REMOVAL_MESSAGE });
  });
});

describe("removal reconciliation", () => {
  it("treats a member missing from the fresh list as gone", () => {
    expect(memberIsGone([member], colleague.id)).toBe(true);
    expect(memberIsGone([member, colleague], colleague.id)).toBe(false);
  });

  it("treats a missing organization as a completed leave", () => {
    expect(organizationIsGone([{ id: ORG_ID }], ORG_ID)).toBe(false);
    expect(organizationIsGone([{ id: OTHER_ORG_ID }], ORG_ID)).toBe(true);
  });

  it("describes a confirmed removal by name", () => {
    expect(memberRemovedNotice(colleague.user.name)).toContain(colleague.user.name);
  });
});

describe("removal request safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never applies a superseded organization's late DELETE", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const guard = createRequestGuard();
    const writes: string[] = [];

    const request = (orgId: string, memberId: string) => {
      const token = guard.start();
      return removeMember(orgId, memberId).then((outcome) => {
        if (guard.accept(token)) writes.push(`${orgId}:${outcome.status}`);
      });
    };

    const oldRequest = request(ORG_ID, colleague.id);
    const newRequest = request(OTHER_ORG_ID, adminMember.id);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvers).toHaveLength(2);

    resolvers[1](
      jsonResponse({ success: true, data: { memberId: adminMember.id } }, 200),
    );
    resolvers[0](
      jsonResponse({ success: true, data: { memberId: colleague.id } }, 200),
    );

    await Promise.all([oldRequest, newRequest]);

    expect(writes).toEqual([`${OTHER_ORG_ID}:success`]);
  });
});

describe("MemberRemovalCard", () => {
  const renderCard = (props: Partial<Parameters<typeof MemberRemovalCard>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(MemberRemovalCard, {
        member: colleague,
        pending: false,
        onConfirm: () => {},
        onCancel: () => {},
        ...props,
      }),
    );

  it("identifies the target and explains what removal does", () => {
    const html = renderCard();

    expect(html).toContain(colleague.user.name);
    expect(html).toContain(colleague.user.email);
    expect(html).toContain("Member");
    expect(html).toContain("revokes");
    expect(html).toContain("Confirm removal");
    expect(html).toContain("Cancel");
  });

  it("shows removing state and blocks a second submission", () => {
    const html = renderCard({ pending: true });

    expect(html).toContain("Removing");
    expect(html).toContain("disabled");
  });

  it("shows an uncertain outcome with a refresh action", () => {
    const html = renderCard({
      message: UNCONFIRMED_REMOVAL_MESSAGE,
      offerRefresh: true,
      onRefreshMembers: () => {},
    });

    expect(html).toContain(UNCONFIRMED_REMOVAL_MESSAGE);
    expect(html).toContain("Refresh members");
    expect(html).toMatch(/disabled=""[^>]*>Confirm removal/);
  });

  it("offers an access refresh without pretending the session ended", () => {
    const html = renderCard({
      message: "Your role in this organization doesn't allow removing this member",
      onRefreshAccess: () => {},
    });

    expect(html).toContain("Refresh access");
    expect(html).not.toContain("sign in");
  });
});

describe("LeaveOrganization", () => {
  const renderLeave = (props: Partial<Parameters<typeof LeaveOrganization>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(LeaveOrganization, {
        organizationName: "Acme Studio",
        phase: "idle",
        onStart: () => {},
        onCancel: () => {},
        onConfirm: () => {},
        onRecheck: () => {},
        ...props,
      }),
    );

  it("names the workspace and explains leaving", () => {
    const html = renderLeave();

    expect(html).toContain("Acme Studio");
    expect(html).toContain("Leave organization");
    expect(html).toContain("no invitation");
  });

  it("asks for confirmation before leaving", () => {
    const html = renderLeave({ phase: "confirming" });

    expect(html).toContain("Confirm leave");
    expect(html).toContain("Cancel");
  });

  it("warns a sole OWNER that another owner is needed", () => {
    const html = renderLeave({ phase: "confirming", soleOwner: true });

    expect(html).toContain("another Owner");
  });

  it("shows the last-owner answer without pretending the leave happened", () => {
    const html = renderLeave({
      phase: "confirming",
      message: LAST_OWNER_LEAVE_MESSAGE,
    });

    expect(html).toContain(LAST_OWNER_LEAVE_MESSAGE);
    expect(html).toContain("Confirm leave");
  });

  it("offers an access recheck after an unconfirmed leave", () => {
    const html = renderLeave({
      phase: "confirming",
      message: UNCONFIRMED_LEAVE_MESSAGE,
      offerRecheck: true,
      onRefreshAccess: () => {},
    });

    expect(html).toContain(UNCONFIRMED_LEAVE_MESSAGE);
    expect(html).toContain("Check my access");
  });

  it("blocks a second leave while the first is still pending", () => {
    const html = renderLeave({ phase: "leaving" });

    expect(html).toContain("Leaving");
    expect(html).toContain("disabled");
  });
});

describe("member row actions", () => {
  it("renders only the actions the page currently permits", () => {
    const removeFor = (target: OrganizationMember) =>
      canRemoveMember("OWNER", target);

    const withRemoval = renderMembers([member, colleague], {
      canEdit: false,
      canRemove: removeFor,
      onRemove: () => {},
    });
    expect(withRemoval).toContain(`Remove ${colleague.user.name} from this workspace`);
    expect(withRemoval).not.toContain("Edit role");

    const withEditing = renderMembers([member, colleague], {
      canEdit: true,
      onEdit: () => {},
    });
    expect(withEditing).toContain("Edit role");
    expect(withEditing).not.toContain("Remove ");
  });
});

describe("createSubmissionLock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const settled = () =>
    jsonResponse({ success: true, data: { memberId: colleague.id } }, 200);

  it("sends one DELETE when confirmation is clicked twice before the re-render", async () => {
    const calls = stubFetch(settled);
    const lock = createSubmissionLock();

    const confirm = () => {
      if (!lock.begin()) return Promise.resolve();
      return removeMember(ORG_ID, colleague.id).finally(() => lock.release());
    };

    await Promise.all([confirm(), confirm()]);

    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("sends one DELETE when Leave Organization is confirmed twice", async () => {
    const calls = stubFetch(settled);
    const lock = createSubmissionLock();

    // Same shape as the page's handleLeave: the caller's own membership id.
    const leave = () => {
      if (!lock.begin()) return Promise.resolve();
      return removeMember(ORG_ID, member.id).finally(() => lock.release());
    };

    await Promise.all([leave(), leave()]);

    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("allows an explicit retry once the previous attempt has settled", async () => {
    const calls = stubFetch(settled);
    const lock = createSubmissionLock();

    const confirm = async () => {
      if (!lock.begin()) return;
      await removeMember(ORG_ID, colleague.id).finally(() => lock.release());
    };

    await confirm();
    await Promise.all([confirm(), confirm()]);

    expect(calls).toHaveLength(2);
  });
});

describe("MembersEntry", () => {
  const html = renderToStaticMarkup(
    createElement(MembersEntry, { slug: "acme-studio" }),
  );

  it("links every role to the canonical members route", () => {
    expect(html).toContain('href="/w/acme-studio/members"');
    expect(html).toContain("View members");
  });

  it("describes the destination without promising an invite flow", () => {
    expect(html).toContain("Team members");
    expect(html).toContain(
      "View and manage the people who have access to this workspace.",
    );
    expect(html).not.toMatch(/invite/i);
  });
});
