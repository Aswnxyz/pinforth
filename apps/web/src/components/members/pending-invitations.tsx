
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/ui/form-alert";
import {
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type OrganizationInvitation,
} from "@/lib/organizations/invitations-api";

type ListState =
  | { status: "loading" }
  | { status: "ready"; invitations: OrganizationInvitation[] }
  | { status: "error"; message: string };

type Notice = {
  type: "success" | "error";
  message: string;
};

type Action = "resend" | "revoke";

export function PendingInvitations({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();

  const [state, setState] = useState<ListState>({
    status: "loading",
  });
  const [refreshCount, setRefreshCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Prevent rapid clicks from submitting duplicate requests.
  const actionInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      const result = await listInvitations(organizationId);

      if (cancelled) return;

      if (
        result.ok &&
        Array.isArray(result.data?.invitations)
      ) {
        setState({
          status: "ready",
          invitations: result.data.invitations,
        });
      } else if (result.status === 401) {
        router.replace("/login");
      } else {
        setState({
          status: "error",
          message: result.ok
            ? "Unable to read invitations."
            : result.message,
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [organizationId, refreshCount, router]);

  function refresh() {
    if (actionInFlight.current) return;

    setNotice(null);
    setConfirmId(null);
    setRefreshCount((value) => value + 1);
  }

  async function handleAction(
    action: Action,
    invitation: OrganizationInvitation,
  ) {
    if (actionInFlight.current) return;

    actionInFlight.current = true;
    setBusyId(invitation.id);
    setNotice(null);

    try {
      const result =
        action === "resend"
          ? await resendInvitation(organizationId, invitation.id)
          : await revokeInvitation(organizationId, invitation.id);

      if (result.status === 401) {
        router.replace("/login");
        return;
      }

      if (!result.ok) {
        const uncertain =
          result.status === 0 || result.status >= 500;

        setNotice({
          type: "error",
          message: uncertain
            ? "We couldn't confirm the result. Refresh the invitations before trying again."
            : result.message,
        });
        return;
      }

      const updated = result.data?.invitation;

      if (!updated || updated.id !== invitation.id) {
        setNotice({
          type: "error",
          message:
            "The server returned an unexpected result. Refresh invitations to check the current status.",
        });
        return;
      }

      setState((current) => {
        if (current.status !== "ready") return current;

        return {
          status: "ready",
          invitations:
            action === "resend"
              ? current.invitations.map((item) =>
                  item.id === updated.id ? updated : item,
                )
              : current.invitations.filter(
                  (item) => item.id !== updated.id,
                ),
        };
      });

      setNotice({
        type: "success",
        message:
          action === "resend"
            ? `A new invitation link was issued for ${invitation.email}.`
            : `Invitation for ${invitation.email} revoked.`,
      });
    } catch {
      setNotice({
        type: "error",
        message:
          "The request outcome is unknown. Refresh invitations before trying again.",
      });
    } finally {
      actionInFlight.current = false;
      setBusyId(null);
      setConfirmId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Pending invitations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage invitations awaiting acceptance or already expired.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={state.status === "loading" || busyId !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {notice && (
        <div className="mt-5">
          {notice.type === "error" ? (
            <FormAlert>{notice.message}</FormAlert>
          ) : (
            <p
              role="status"
              className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2.5 text-sm text-status-approved"
            >
              {notice.message}
            </p>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Loading invitations...
        </p>
      )}

      {state.status === "error" && (
        <div className="mt-6">
          <FormAlert>{state.message}</FormAlert>
        </div>
      )}

      {state.status === "ready" &&
        (state.invitations.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No outstanding invitations.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-border">
            {state.invitations.map((invitation) => (
              <li key={invitation.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {invitation.role === "ADMIN"
                        ? "Admin"
                        : "Member"}
                      {" · "}
                      Expires{" "}
                      {new Date(
                        invitation.expiresAt,
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  <span className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize text-foreground">
                    {invitation.status}
                  </span>
                </div>

                {confirmId === invitation.id ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-danger/40 p-4">
                    <p className="text-sm text-foreground">
                      Revoke this invitation? Its link will stop
                      working immediately.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          void handleAction("revoke", invitation)
                        }
                        className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-danger-foreground disabled:opacity-50"
                      >
                        {busyId === invitation.id
                          ? "Revoking..."
                          : "Confirm revoke"}
                      </button>

                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => setConfirmId(null)}
                        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() =>
                        void handleAction("resend", invitation)
                      }
                      className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
                    >
                      {busyId === invitation.id
                        ? "Resending..."
                        : "Resend"}
                    </button>

                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() =>
                        setConfirmId(invitation.id)
                      }
                      className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

