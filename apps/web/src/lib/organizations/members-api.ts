import type { OrganizationRole } from "@pinforth/shared";
import { apiFetch, type ApiResult } from "@/lib/auth/api";

/**
 * The organization member API client.
 *
 * Reuses `apiFetch`, so credentials, the coordinated 401 refresh and network
 * error normalisation are inherited. Requests use the organization's backend
 * id, never its display slug.
 */

export interface OrganizationMember {
  /** The membership id used in PATCH and DELETE URLs. */
  id: string;
  role: OrganizationRole;
  joinedAt: string;
  user: {
    /** The user's account id, never the membership id. */
    id: string;
    name: string;
    email: string;
  };
  isYou: boolean;
}

export interface MemberRemoval {
  memberId: string;
}

export type MemberField = "role";

/**
 * The outcome of a member request.
 *
 * `unauthorized` is only used when the API confirmed the session is over;
 * `unavailable` covers outages, network failures and unreadable responses.
 * A failed list is never an empty list, and a malformed mutation response is
 * never a confirmed success.
 */
export type MemberApiOutcome<Data> =
  | { status: "success"; data: Data }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "not-found" }
  | {
      status: "rejected";
      message: string;
      code?: string;
      fields?: Partial<Record<MemberField, string>>;
    }
  | { status: "last-owner"; message: string; code: "LAST_OWNER" }
  | { status: "conflict"; message: string; code?: string }
  | { status: "unavailable"; message: string; code?: string };

const MALFORMED_MESSAGE =
  "Pinforth received an unexpected response. Please refresh and try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

/**
 * Runtime guards for successful responses. A 200 with a missing or wrongly
 * typed field is malformed, not a success.
 */
function isOrganizationMember(value: unknown): value is OrganizationMember {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOrganizationRole(value.role) &&
    isString(value.joinedAt) &&
    isRecord(value.user) &&
    isString(value.user.id) &&
    isString(value.user.name) &&
    isString(value.user.email) &&
    typeof value.isYou === "boolean"
  );
}

function isMemberList(value: unknown): value is OrganizationMember[] {
  return Array.isArray(value) && value.every(isOrganizationMember);
}

function isMemberRemoval(value: unknown): value is MemberRemoval {
  return isRecord(value) && isString(value.memberId);
}

function pickField(key: string) {
  return (data: unknown) => (isRecord(data) ? data[key] : undefined);
}

function roleFieldErrors(
  details: unknown,
): Partial<Record<MemberField, string>> | undefined {
  if (!Array.isArray(details)) return undefined;

  const fields: Partial<Record<MemberField, string>> = {};

  for (const detail of details) {
    if (
      !isRecord(detail) ||
      detail.path !== "role" ||
      !isString(detail.message)
    ) {
      continue;
    }

    fields.role ??= detail.message;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function mapFailure<Data>(res: ApiResult<unknown>): MemberApiOutcome<Data> {
  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) {
    return { status: "forbidden", message: res.message };
  }
  if (res.status === 404) return { status: "not-found" };

  if (res.status === 409) {
    if (res.code === "LAST_OWNER") {
      return {
        status: "last-owner",
        message: res.message,
        code: "LAST_OWNER",
      };
    }

    return {
      status: "conflict",
      message: res.message,
      ...(res.code ? { code: res.code } : {}),
    };
  }

  if (res.status === 400) {
    const fields = roleFieldErrors(res.details);

    return {
      status: "rejected",
      message: res.message,
      ...(res.code ? { code: res.code } : {}),
      ...(fields ? { fields } : {}),
    };
  }

  // Status 0 is a network failure; 5xx is a server outage. Neither proves
  // the session ended, and neither authorises an automatic mutation retry.
  if (res.status === 0 || res.status >= 500) {
    return {
      status: "unavailable",
      message: res.message,
      ...(res.code ? { code: res.code } : {}),
    };
  }

  return {
    status: "rejected",
    message: res.message,
    ...(res.code ? { code: res.code } : {}),
  };
}

function mapMemberOutcome<Data>(
  res: ApiResult<unknown>,
  pick: (data: unknown) => unknown,
  isData: (value: unknown) => value is Data,
): MemberApiOutcome<Data> {
  if (res.ok) {
    const data = pick(res.data);

    if (!isData(data)) {
      return { status: "unavailable", message: MALFORMED_MESSAGE };
    }

    return { status: "success", data };
  }

  return mapFailure<Data>(res);
}

const membersPath = (orgId: string) =>
  `/api/v1/organizations/${encodeURIComponent(orgId)}/members`;

const memberPath = (orgId: string, memberId: string) =>
  `${membersPath(orgId)}/${encodeURIComponent(memberId)}`;

export async function listMembers(
  orgId: string,
): Promise<MemberApiOutcome<OrganizationMember[]>> {
  const res = await apiFetch<unknown>(membersPath(orgId), { method: "GET" });

  return mapMemberOutcome(res, pickField("members"), isMemberList);
}

export async function changeMemberRole(
  orgId: string,
  memberId: string,
  role: OrganizationRole,
): Promise<MemberApiOutcome<OrganizationMember>> {
  const res = await apiFetch<unknown>(memberPath(orgId, memberId), {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

  return mapMemberOutcome(res, pickField("member"), isOrganizationMember);
}

export async function removeMember(
  orgId: string,
  memberId: string,
): Promise<MemberApiOutcome<MemberRemoval>> {
  const res = await apiFetch<unknown>(memberPath(orgId, memberId), {
    method: "DELETE",
  });

  return mapMemberOutcome(res, (data) => data, isMemberRemoval);
}
