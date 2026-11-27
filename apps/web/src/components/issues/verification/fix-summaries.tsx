"use client";

import { useState } from "react";
import { formatDeploymentTime } from "@/lib/deployments/deployment-values";
import type { PendingFix, VerifiedOn } from "@/lib/issues/api";
import { actorName } from "@/lib/issues/verification-values";
import { linkButton, primaryButton } from "./styles";

const Label = ({ children }: { children: string }) => (
  <span className="font-mono font-semibold break-all text-foreground">{children}</span>
);

/** The fix waiting to be tested, and what the viewer can do with it. */
export function PendingFixSummary({
  fix,
  access,
  canWithdraw,
  locked,
  onTest,
  onWithdraw,
}: {
  fix: PendingFix;
  access: "allowed" | "self" | "own-fix";
  canWithdraw: boolean;
  locked: boolean;
  onTest: () => void;
  onWithdraw: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-status-qa-pending/40 bg-status-qa-pending-bg px-3 py-2.5 text-sm">
        <p className="text-status-qa-pending-foreground">
          Attempt {fix.attemptNumber} is waiting to be tested. Fix in <Label>{fix.deployment.label}</Label> by{" "}
          {actorName(fix.submittedBy)} · {formatDeploymentTime(fix.createdAt)}
        </p>
        {fix.note ? <p className="mt-1 wrap-break-word whitespace-pre-wrap text-foreground">{fix.note}</p> : null}
      </div>

      {access === "own-fix" ? (
        <p className="text-sm text-muted-foreground">You submitted this fix, so someone else needs to test it.</p>
      ) : (
        <button type="button" onClick={onTest} disabled={locked} className={primaryButton}>
          Test this fix
        </button>
      )}

      {canWithdraw ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-foreground">Withdraw attempt {fix.attemptNumber}? It stays in the history.</span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onWithdraw();
              }}
              disabled={locked}
              className="text-sm font-medium text-danger underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              Withdraw fix
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={locked} className={linkButton}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} disabled={locked} className={`block ${linkButton}`}>
            Withdraw this fix
          </button>
        )
      ) : null}
    </div>
  );
}

/** "Verified on v1.5 by Priya", or "Self-verified" when the only member tested their own fix. */
export function VerifiedSummary({ verified }: { verified: VerifiedOn }) {
  return (
    <p className="rounded-md border border-status-qa-verified/40 bg-status-qa-verified/10 px-3 py-2.5 text-sm text-status-qa-verified-foreground">
      {verified.selfVerified ? "Self-verified" : "Verified"} on <Label>{verified.deployment.label}</Label> by{" "}
      {actorName(verified.verifiedBy)} · {formatDeploymentTime(verified.verifiedAt)}
    </p>
  );
}
