"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { MembersList } from "@/components/members/members-list";
import { MemberRoleEditor } from "@/components/members/member-role-editor";
import { MemberRemovalCard } from "@/components/members/member-removal-card";
import {
  LeaveOrganization,
  type LeavePhase,
} from "@/components/members/leave-organization";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { WorkspaceLoading } from "@/components/workspace/workspace-states";
import { FormAlert } from "@/components/ui/form-alert";
import type { OrganizationRole } from "@pinforth/shared";
import {
  listOrganizations,
  type OrganizationSummary,
} from "@/lib/organizations/api";
import { useWorkspaces } from "@/lib/organizations/context";
import {
  canManageMembers,
  resolveOrganizationAccess,
} from "@/lib/organizations/organization-access";
import {
  changeMemberRole,
  removeMember,
  type OrganizationMember,
} from "@/lib/organizations/members-api";
import { createRequestGuard } from "@/lib/projects/project-detail";
import { describeMemberFailure } from "@/lib/members/member-failure";
import {
  loadMemberList,
  type MemberListState,
} from "@/lib/members/member-list";
import {
  LAST_OWNER_LEAVE_MESSAGE,
  LAST_OWNER_REMOVAL_MESSAGE,
  LEAVE_STILL_MEMBER_MESSAGE,
  REMOVAL_NOT_OBSERVED_MESSAGE,
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
  ROLE_CHANGE_NOT_SAVED_MESSAGE,
  UNCONFIRMED_ROLE_CHANGE_MESSAGE,
  describeRoleChangeFailure,
  replaceMember,
  roleChangeLanded,
} from "@/lib/members/member-role";

export default function MembersPage() {
  return (
    <WorkspaceGate>
      {/* The slug is only known at request time, so it is read behind a
          Suspense boundary and the shell can still be prerendered. */}
      <Suspense fallback={<WorkspaceLoading />}>
        <MembersView />
      </Suspense>
    </WorkspaceGate>
  );
}

function MembersView() {
  const params = useParams<{ orgSlug: string }>();
  const { organizations } = useWorkspaces();

  // The URL slug is never trusted: the workspace must be one the signed-in
  // user can actually reach, or the state is "unavailable".
  const access = resolveOrganizationAccess(organizations, params.orgSlug);

  if (access.kind === "unavailable") {
    return <UnavailableWorkspace />;
  }

  const { organization } = access;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader organization={organization} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Link
            href={`/w/${organization.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
              <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.81 8l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
            Back to {organization.name}
          </Link>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {organization.name} · Members
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Team members
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              People who have access to this workspace.
            </p>
          </div>

          {/* Keyed by id so a different workspace always starts from a fresh
              load — member data from one organization is never carried over
              into another. */}
          <MemberListSection key={organization.id} organization={organization} />
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}

/**
 * The role-editing session of one member.
 *
 * `editing` is idle; `saving` the PATCH; `checking` the read-back after an
 * unconfirmed answer. `offerAccessRefresh` means the backend refused the
 * caller's permission, which is not an expired session.
 */
interface RoleEditState {
  key: string;
  memberId: string;
  /** The role that was submitted, or null before the first save. */
  role: OrganizationRole | null;
  phase: "editing" | "saving" | "checking";
  message: string | null;
  /** Offer a fresh GET before saving is tried again. */
  offerRefresh: boolean;
  offerAccessRefresh: boolean;
}

/**
 * The removal confirmation of one member.
 *
 * `confirming` waits for an explicit second click; `deleting` is the DELETE;
 * `checking` is the read-back after an unconfirmed answer.
 */
interface RemovalState {
  key: string;
  memberId: string;
  phase: "confirming" | "deleting" | "checking";
  message: string | null;
  /** Offer a fresh GET before removal is tried again. */
  offerRefresh: boolean;
  offerAccessRefresh: boolean;
}

/**
 * The leave flow.
 *
 * The DELETE always addresses the caller's own membership (`isYou`), never the
 * user account id, and `checking` re-reads the caller's organization list.
 */
interface LeaveState {
  key: string;
  phase: LeavePhase;
  message: string | null;
  /** Offer a fresh organization-list check before leaving is tried again. */
  offerRecheck: boolean;
  offerAccessRefresh: boolean;
}

/**
 * The member list plus the state of the in-flight request.
 *
 * The request addresses the organization by its backend id (never the URL
 * slug), and `loadMemberList` never throws — every failure arrives as a typed
 * outcome. A response from a superseded request is dropped by the guard, so
 * switching workspaces or retrying can never show stale data.
 */
function MemberListSection({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  const router = useRouter();
  const { refresh } = useWorkspaces();

  const [retryToken, setRetryToken] = useState(0);

  // Identifies the request this render belongs to. When it changes (another
  // organization, a retry) the derived state below is loading again, so data
  // fetched under one workspace is never rendered under another.
  const requestKey = `${organization.id}|${retryToken}`;

  const [result, setResult] = useState<{
    key: string;
    state: MemberListState;
  } | null>(null);

  const [roleEdit, setRoleEdit] = useState<RoleEditState | null>(null);
  const [removal, setRemoval] = useState<RemovalState | null>(null);
  const [leave, setLeave] = useState<LeaveState | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(
    null,
  );

  // The row action to focus once a confirmation closes, so keyboard users
  // return to where they came from instead of the top of the page.
  const focusAfterClose = useRef<string | null>(null);

  const guard = useRef(createRequestGuard());
  // Closes the click-before-re-render gap for the two DELETE flows.
  const submissionLock = useRef(createSubmissionLock());

  useEffect(() => {
    const token = guard.current.start();

    loadMemberList(organization.id).then((state) => {
      // A newer request has started; this result belongs to the past.
      if (guard.current.accept(token)) {
        setResult({ key: requestKey, state });
      }
    });
  }, [organization.id, requestKey]);

  const state: MemberListState =
    result && result.key === requestKey ? result.state : { kind: "loading" };

  // The editing session belongs to one request key: switching workspace or
  // retrying derives as "not editing", so a pending edit never leaks across.
  const activeRoleEdit =
    roleEdit && roleEdit.key === requestKey ? roleEdit : null;
  // The removal and leave flows are keyed the same way, so a workspace switch
  // or reload derives them as closed and frees their requests' effects.
  const activeRemoval =
    removal && removal.key === requestKey ? removal : null;
  const activeLeave = leave && leave.key === requestKey ? leave : null;
  const noticeMessage =
    notice && notice.key === requestKey ? notice.message : null;

  useEffect(() => {
    const target = focusAfterClose.current;
    if (activeRemoval !== null || target === null) return;

    // The confirmation has closed and the row action is rendered again.
    focusAfterClose.current = null;
    document.getElementById(target)?.focus();
  }, [activeRemoval]);

  useEffect(() => {
    // The session was confirmed invalid by the API's refresh flow.
    if (state.kind === "login") {
      router.replace("/login");
    }
  }, [state.kind, router]);

  if (state.kind === "loading" || state.kind === "login") {
    return <WorkspaceLoading />;
  }

  if (state.kind === "not-found") {
    // Missing and inaccessible share this exact state, on purpose: the
    // response must not reveal whether a workspace exists.
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Workspace not available
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          This workspace is not available. The link may be out of date, or
          you may not have access to it.
        </p>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          You don’t have access to this workspace
        </h2>
        <div className="mt-4">
          <FormAlert>{state.message}</FormAlert>
        </div>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Members unavailable
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          We could not load the team members. This is usually temporary.
        </p>

        <div className="mt-4">
          <FormAlert>{state.message}</FormAlert>
        </div>

        <button
          type="button"
          onClick={() => setRetryToken((token) => token + 1)}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  const canEdit = canManageMembers(organization.role);
  const editingMember =
    activeRoleEdit === null
      ? null
      : state.members.find((member) => member.id === activeRoleEdit.memberId) ??
        null;

  /**
   * Saves one role change.
   *
   * Nothing is shown as saved until the backend confirms it. A confirmed
   * change is reconciled from the returned member; an unconfirmed one is
   * never repeated — the list has to be read back first.
   */
  async function handleSave(member: OrganizationMember, role: OrganizationRole) {
    const key = requestKey;
    const token = guard.current.start();

    setRoleEdit({
      key,
      memberId: member.id,
      role,
      phase: "saving",
      message: null,
      offerRefresh: false,
      offerAccessRefresh: false,
    });

    const outcome = await changeMemberRole(organization.id, member.id, role);

    // A newer request superseded this one (workspace switch, retry, refresh);
    // its response must not touch this screen.
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      setResult((current) =>
        current && current.key === key && current.state.kind === "ready"
          ? {
              key,
              state: {
                kind: "ready",
                members: replaceMember(current.state.members, outcome.data),
              },
            }
          : current,
      );
      setRoleEdit(null);

      // The caller's own role may have changed, so owner-only controls must
      // disappear as soon as the workspace context agrees.
      if (outcome.data.isYou) await refresh();
      return;
    }

    const failure = describeRoleChangeFailure(outcome);

    if (failure.kind === "login") {
      router.replace("/login");
      return;
    }

    if (failure.kind === "gone") {
      // The member no longer exists; a fresh list drops the stale row.
      setRoleEdit(null);
      setRetryToken((current) => current + 1);
      return;
    }

    // The editor and its selection stay open so the change can be corrected
    // or checked. Only an unconfirmed answer offers the read-back, and a
    // permission change offers an access refresh instead of a logout.
    setRoleEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "editing",
            message: failure.message,
            offerRefresh: failure.kind === "refresh",
            offerAccessRefresh: failure.kind === "access",
          }
        : current,
    );
  }

  /**
   * Reads the list back after an unconfirmed PATCH and reconciles the editor.
   *
   * The PATCH itself is never repeated. When the fresh list shows the
   * submitted role the change landed; when it does not, the editor keeps the
   * entered role and says so.
   */
  async function handleRefreshMembers() {
    if (activeRoleEdit === null || activeRoleEdit.role === null) return;

    const key = requestKey;
    const token = guard.current.start();
    const submitted = activeRoleEdit;
    const submittedRole = activeRoleEdit.role;

    setRoleEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "checking",
            message: null,
            offerRefresh: false,
            offerAccessRefresh: false,
          }
        : current,
    );

    const fresh = await loadMemberList(organization.id);

    // A newer request superseded this read-back.
    if (!guard.current.accept(token)) return;

    if (fresh.kind === "login") {
      router.replace("/login");
      return;
    }

    if (fresh.kind === "not-found") {
      setRoleEdit(null);
      setRetryToken((current) => current + 1);
      return;
    }

    if (fresh.kind === "ready") {
      setResult({ key, state: fresh });

      if (!fresh.members.some((member) => member.id === submitted.memberId)) {
        setRoleEdit(null);
        return;
      }

      if (roleChangeLanded(fresh.members, submitted.memberId, submittedRole)) {
        const edited = fresh.members.find(
          (member) => member.id === submitted.memberId,
        );
        setRoleEdit(null);
        if (edited?.isYou) await refresh();
        return;
      }

      setRoleEdit((current) =>
        current && current.key === key
          ? {
              ...current,
              phase: "editing",
              message: ROLE_CHANGE_NOT_SAVED_MESSAGE,
              offerRefresh: false,
              offerAccessRefresh: false,
            }
          : current,
      );
      return;
    }

    // The read-back failed too; the entered role stays and is offered again.
    setRoleEdit((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "editing",
            message: UNCONFIRMED_ROLE_CHANGE_MESSAGE,
            offerRefresh: true,
            offerAccessRefresh: false,
          }
        : current,
    );
  }

  // The narrowed members, captured once: the handlers below run later, when
  // TypeScript no longer keeps the discriminated union of `state`.
  const members = state.members;
  const ownMember = members.find((member) => member.isYou) ?? null;

  const removalTarget =
    activeRemoval === null
      ? null
      : members.find((member) => member.id === activeRemoval.memberId) ?? null;

  // Only one role-editing, removal or leave interaction at a time. While one
  // is open the rows keep their read-only appearance.
  const interactionOpen =
    activeRoleEdit !== null || activeRemoval !== null || activeLeave !== null;
  const requestPending =
    activeRoleEdit?.phase === "saving" ||
    activeRoleEdit?.phase === "checking" ||
    activeRemoval?.phase === "deleting" ||
    activeRemoval?.phase === "checking" ||
    activeLeave?.phase === "leaving" ||
    activeLeave?.phase === "checking";

  function handleStartRemoval(member: OrganizationMember) {
    // Only one interaction at a time; an unsubmitted role edit is dropped.
    setRoleEdit(null);
    setLeave(null);
    setNotice(null);
    setRemoval({
      key: requestKey,
      memberId: member.id,
      phase: "confirming",
      message: null,
      offerRefresh: false,
      offerAccessRefresh: false,
    });
  }

  function handleCancelRemoval() {
    const target = activeRemoval;
    if (target) focusAfterClose.current = `remove-member-${target.memberId}`;

    setRemoval(null);
  }

  /**
   * Removes one member.
   *
   * The row only disappears on a backend-confirmed DELETE that names this
   * membership. An unconfirmed answer is never repeated — the list has to be
   * read back first.
   */
  async function handleRemove(member: OrganizationMember) {
    // A second confirmation before the re-render must not send a second DELETE.
    if (!submissionLock.current.begin()) return;

    const key = requestKey;
    const token = guard.current.start();

    setRemoval({
      key,
      memberId: member.id,
      phase: "deleting",
      message: null,
      offerRefresh: false,
      offerAccessRefresh: false,
    });

    const outcome = await removeMember(organization.id, member.id).finally(() =>
      submissionLock.current.release(),
    );

    // A newer request superseded this one; its response must not touch it.
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      if (outcome.data.memberId === member.id) {
        setResult((current) =>
          current && current.key === key && current.state.kind === "ready"
            ? {
                key,
                state: {
                  kind: "ready",
                  members: current.state.members.filter(
                    (candidate) => candidate.id !== member.id,
                  ),
                },
              }
            : current,
        );
        setNotice({ key, message: memberRemovedNotice(member.user.name) });
      } else {
        // The backend confirmed a different membership; let the list decide.
        setRetryToken((current) => current + 1);
      }

      setRemoval(null);
      return;
    }

    const failure = describeMemberFailure(outcome, {
      lastOwnerMessage: LAST_OWNER_REMOVAL_MESSAGE,
      unconfirmedMessage: UNCONFIRMED_REMOVAL_MESSAGE,
    });

    if (failure.kind === "login") {
      router.replace("/login");
      return;
    }

    if (failure.kind === "gone") {
      // Already removed elsewhere; a fresh list drops the stale row.
      setRemoval(null);
      setRetryToken((current) => current + 1);
      return;
    }

    // The confirmation and its target stay on screen so the outcome can be
    // corrected or checked. Only an unconfirmed DELETE offers the read-back.
    setRemoval((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "confirming",
            message: failure.message,
            offerRefresh: failure.kind === "refresh",
            offerAccessRefresh: failure.kind === "access",
          }
        : current,
    );
  }

  /**
   * Reads the list back after an unconfirmed DELETE.
   *
   * The DELETE is never repeated. A missing target proves the removal is
   * live; a present target says the removal was not applied and permits a new
   * explicit attempt; a failed read keeps the uncertain state.
   */
  async function handleRefreshRemoval() {
    if (activeRemoval === null) return;

    const key = requestKey;
    const token = guard.current.start();
    const submitted = activeRemoval;
    const targetName =
      members.find((member) => member.id === submitted.memberId)?.user.name ??
      "The member";

    setRemoval((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "checking",
            message: null,
            offerRefresh: false,
            offerAccessRefresh: false,
          }
        : current,
    );

    const fresh = await loadMemberList(organization.id);

    if (!guard.current.accept(token)) return;

    if (fresh.kind === "login") {
      router.replace("/login");
      return;
    }

    if (fresh.kind === "not-found") {
      setRemoval(null);
      setRetryToken((current) => current + 1);
      return;
    }

    if (fresh.kind === "forbidden") {
      setRemoval((current) =>
        current && current.key === key
          ? {
              ...current,
              phase: "confirming",
              message: fresh.message,
              offerRefresh: false,
              offerAccessRefresh: true,
            }
          : current,
      );
      return;
    }

    if (fresh.kind !== "ready") {
      // The read-back failed too; the uncertain state stays on screen.
      setRemoval((current) =>
        current && current.key === key
          ? {
              ...current,
              phase: "confirming",
              message: UNCONFIRMED_REMOVAL_MESSAGE,
              offerRefresh: true,
              offerAccessRefresh: false,
            }
          : current,
      );
      return;
    }

    setResult({ key, state: fresh });

    if (memberIsGone(fresh.members, submitted.memberId)) {
      setRemoval(null);
      setNotice({ key, message: memberRemovedNotice(targetName) });
      return;
    }

    setRemoval((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "confirming",
            message: REMOVAL_NOT_OBSERVED_MESSAGE,
            offerRefresh: false,
            offerAccessRefresh: false,
          }
        : current,
    );
  }

  function handleStartLeave() {
    setRoleEdit(null);
    setRemoval(null);
    setNotice(null);
    setLeave({
      key: requestKey,
      phase: "confirming",
      message: null,
      offerRecheck: false,
      offerAccessRefresh: false,
    });
  }

  /**
   * Leaves the workspace by removing the caller's own membership.
   *
   * A confirmed DELETE refreshes the workspace list — the authority on what
   * the caller can still reach — and only then returns to the chooser. The
   * session itself is untouched.
   */
  async function handleLeave() {
    if (ownMember === null) return;
    // A second confirmation before the re-render must not send a second DELETE.
    if (!submissionLock.current.begin()) return;

    const key = requestKey;
    const token = guard.current.start();

    setLeave((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "leaving",
            message: null,
            offerRecheck: false,
            offerAccessRefresh: false,
          }
        : current,
    );

    const outcome = await removeMember(organization.id, ownMember.id).finally(
      () => submissionLock.current.release(),
    );

    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") {
      setLeave(null);
      await refresh();
      router.replace("/w");
      return;
    }

    const failure = describeMemberFailure(outcome, {
      lastOwnerMessage: LAST_OWNER_LEAVE_MESSAGE,
      unconfirmedMessage: UNCONFIRMED_LEAVE_MESSAGE,
    });

    if (failure.kind === "login") {
      router.replace("/login");
      return;
    }

    if (failure.kind === "gone") {
      // A 404 cannot confirm the leave; only a fresh organization list can.
      setLeave((current) =>
        current && current.key === key
          ? {
              ...current,
              phase: "confirming",
              message: UNCONFIRMED_LEAVE_MESSAGE,
              offerRecheck: true,
              offerAccessRefresh: false,
            }
          : current,
      );
      return;
    }

    setLeave((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "confirming",
            message:
              failure.kind === "refresh"
                ? UNCONFIRMED_LEAVE_MESSAGE
                : failure.message,
            offerRecheck: failure.kind === "refresh",
            offerAccessRefresh: failure.kind === "access",
          }
        : current,
    );
  }

  /**
   * Settles an unconfirmed leave with a fresh authenticated organization list.
   *
   * The list — not the DELETE — decides whether the membership is gone. When
   * the check fails, neither outcome is claimed.
   */
  async function handleRecheckLeave() {
    const key = requestKey;
    const token = guard.current.start();

    setLeave((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "checking",
            message: null,
            offerRecheck: false,
            offerAccessRefresh: false,
          }
        : current,
    );

    const outcome = await listOrganizations();

    if (!guard.current.accept(token)) return;

    if (outcome.status === "unauthorized") {
      router.replace("/login");
      return;
    }

    if (outcome.status === "success") {
      if (organizationIsGone(outcome.organizations, organization.id)) {
        await refresh();
        router.replace("/w");
        return;
      }

      setLeave((current) =>
        current && current.key === key
          ? {
              ...current,
              phase: "confirming",
              message: LEAVE_STILL_MEMBER_MESSAGE,
              offerRecheck: false,
              offerAccessRefresh: false,
            }
          : current,
      );
      return;
    }

    setLeave((current) =>
      current && current.key === key
        ? {
            ...current,
            phase: "confirming",
            message: UNCONFIRMED_LEAVE_MESSAGE,
            offerRecheck: true,
            offerAccessRefresh: false,
          }
        : current,
    );
  }

  return (
    <div className="space-y-4">
      {noticeMessage ? (
        <p
          role="status"
          className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2.5 text-sm text-status-approved"
        >
          {noticeMessage}
        </p>
      ) : null}

      <MembersList
        members={members}
        canEdit={canEdit && !interactionOpen}
        onEdit={
          canEdit && !interactionOpen
            ? (member) => {
                setRemoval(null);
                setLeave(null);
                setNotice(null);
                setRoleEdit({
                  key: requestKey,
                  memberId: member.id,
                  role: null,
                  phase: "editing",
                  message: null,
                  offerRefresh: false,
                  offerAccessRefresh: false,
                });
              }
            : undefined
        }
        canRemove={(member) => canRemoveMember(organization.role, member)}
        onRemove={interactionOpen ? undefined : handleStartRemoval}
      />

      {activeRoleEdit && editingMember ? (
        <MemberRoleEditor
          key={activeRoleEdit.memberId}
          member={editingMember}
          onSubmit={(role) => {
            void handleSave(editingMember, role);
          }}
          onCancel={() => setRoleEdit(null)}
          pending={
            activeRoleEdit.phase === "saving" ||
            activeRoleEdit.phase === "checking"
          }
          message={activeRoleEdit.message}
          offerRefresh={activeRoleEdit.offerRefresh}
          onRefreshMembers={
            activeRoleEdit.offerRefresh
              ? () => {
                  void handleRefreshMembers();
                }
              : undefined
          }
          onRefreshAccess={
            activeRoleEdit.offerAccessRefresh ? () => void refresh() : undefined
          }
        />
      ) : null}

      {activeRemoval && removalTarget ? (
        <MemberRemovalCard
          key={activeRemoval.memberId}
          member={removalTarget}
          pending={activeRemoval.phase !== "confirming"}
          message={activeRemoval.message}
          offerRefresh={activeRemoval.offerRefresh}
          onConfirm={() => {
            void handleRemove(removalTarget);
          }}
          onCancel={handleCancelRemoval}
          onRefreshMembers={
            activeRemoval.offerRefresh
              ? () => {
                  void handleRefreshRemoval();
                }
              : undefined
          }
          onRefreshAccess={
            activeRemoval.offerAccessRefresh ? () => void refresh() : undefined
          }
        />
      ) : null}

      <LeaveOrganization
        organizationName={organization.name}
        phase={activeLeave?.phase ?? "idle"}
        soleOwner={
          ownMember !== null && isSoleOwnerLeaving(members, ownMember.id)
        }
        message={activeLeave?.message ?? null}
        offerRecheck={activeLeave?.offerRecheck ?? false}
        startDisabled={requestPending}
        onStart={handleStartLeave}
        onCancel={() => setLeave(null)}
        onConfirm={() => {
          void handleLeave();
        }}
        onRecheck={() => {
          void handleRecheckLeave();
        }}
        onRefreshAccess={
          activeLeave?.offerAccessRefresh ? () => void refresh() : undefined
        }
      />
    </div>
  );
}

function UnavailableWorkspace() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <AppHeader />

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Workspace not available
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            This workspace is not available. The link may be out of date, or
            you may not have access to it.
          </p>

          <Link
            href="/w"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to your workspaces
          </Link>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Pinforth — from feedback to sign-off.
      </footer>
    </div>
  );
}
